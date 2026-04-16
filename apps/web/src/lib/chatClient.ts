import { resolveApiUrl } from "@/apiBase";

export type ChatPostResponse = {
  reply: string;
  traceId: string;
};

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string; detail?: string };
    const parts = [parsed.error, parsed.detail].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" — ");
    }
  } catch {
    // ignore
  }
  return text || `HTTP ${response.status}`;
}

const chatFetchTimeoutMs = 180_000;

export async function postChat(
  accessToken: string,
  message: string,
  options?: { skill_id?: string },
): Promise<ChatPostResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), chatFetchTimeoutMs);
  try {
    const response = await fetch(resolveApiUrl("/api/chat"), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        ...(options?.skill_id ? { skill_id: options.skill_id } : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    return response.json() as Promise<ChatPostResponse>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Chat request timed out after ${Math.round(chatFetchTimeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type ChatStreamHandlers = {
  onMeta?: (payload: { trace_id: string }) => void;
  onToken?: (delta: string) => void;
};

function parseSseBlock(block: string): { event: string; data: string } | null {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return { event: eventName, data: dataLines.join("\n") };
}

/**
 * Same JSON body as {@link postChat}, but requests SSE (`Accept: text/event-stream`) and parses
 * `meta` / `token` / `done` / `error` events. Use {@link ChatStreamHandlers} for incremental UI.
 */
export async function postChatStream(
  accessToken: string,
  message: string,
  options: { skill_id?: string } | undefined,
  handlers: ChatStreamHandlers | undefined,
  signal: AbortSignal,
): Promise<ChatPostResponse> {
  const response = await fetch(resolveApiUrl("/api/chat"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message,
      ...(options?.skill_id ? { skill_id: options.skill_id } : {}),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const body = response.body;
  if (!body) {
    throw new Error("No response body");
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let traceId = "";
  let reply = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      let separatorIndex: number;
      while ((separatorIndex = buffer.indexOf("\n\n")) >= 0) {
        const rawBlock = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = parseSseBlock(rawBlock);
        if (!parsed) {
          continue;
        }
        let payload: unknown;
        try {
          payload = JSON.parse(parsed.data) as unknown;
        } catch {
          continue;
        }
        switch (parsed.event) {
          case "meta": {
            const meta = payload as { trace_id?: string };
            if (typeof meta.trace_id === "string") {
              traceId = meta.trace_id;
              handlers?.onMeta?.({ trace_id: meta.trace_id });
            }
            break;
          }
          case "token": {
            const token = payload as { delta?: string };
            if (typeof token.delta === "string" && token.delta.length > 0) {
              handlers?.onToken?.(token.delta);
            }
            break;
          }
          case "done": {
            const donePayload = payload as { reply?: string };
            reply = typeof donePayload.reply === "string" ? donePayload.reply : "";
            return { reply, traceId };
          }
          case "error": {
            const err = payload as { message?: string };
            throw new Error(typeof err.message === "string" ? err.message : "Chat stream failed");
          }
          default:
            break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (reply === "" && traceId === "") {
    throw new Error("Stream ended without a complete response");
  }
  return { reply: reply || "(No output)", traceId };
}
