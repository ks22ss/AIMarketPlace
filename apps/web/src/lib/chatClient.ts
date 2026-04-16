import { resolveApiUrl } from "@/apiBase";

import { createThinkSplitter } from "./thinkSplitter";

export type ChatPostResponse = {
  reply: string;
  traceId: string;
  conversationId: string;
  conversationTitle: string;
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

export type ChatSendOptions = {
  skill_id?: string;
  conversation_id?: string;
};

function buildBody(message: string, options?: ChatSendOptions): string {
  return JSON.stringify({
    message,
    ...(options?.skill_id ? { skill_id: options.skill_id } : {}),
    ...(options?.conversation_id ? { conversation_id: options.conversation_id } : {}),
  });
}

export async function postChat(
  accessToken: string,
  message: string,
  options?: ChatSendOptions,
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
      body: buildBody(message, options),
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
  /** Visible content delta (already stripped of `<think>` markers). */
  onToken?: (delta: string) => void;
  /** Reasoning delta (text inside `<think>...</think>`). */
  onReasoningDelta?: (delta: string) => void;
  /** Emitted once persistence is ready, before `done`. */
  onConversation?: (payload: { conversation_id: string; title: string }) => void;
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
 * `meta` / `conversation` / `token` / `done` / `error` events. Raw `<think>...</think>` markers in
 * the stream are routed to {@link ChatStreamHandlers.onReasoningDelta}; visible text is routed to
 * {@link ChatStreamHandlers.onToken}. Use {@link ChatStreamHandlers} for incremental UI.
 */
export async function postChatStream(
  accessToken: string,
  message: string,
  options: ChatSendOptions | undefined,
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
    body: buildBody(message, options),
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
  const splitter = createThinkSplitter();
  let buffer = "";
  let traceId = "";
  let reply = "";
  let conversationId = "";
  let conversationTitle = "";

  function emitSplit(delta: string): void {
    const tokens = splitter.push(delta);
    for (const tok of tokens) {
      if (tok.kind === "content") {
        handlers?.onToken?.(tok.text);
      } else {
        handlers?.onReasoningDelta?.(tok.text);
      }
    }
  }

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
          case "conversation": {
            const conv = payload as { conversation_id?: string; title?: string };
            if (typeof conv.conversation_id === "string") {
              conversationId = conv.conversation_id;
              conversationTitle = typeof conv.title === "string" ? conv.title : "";
              handlers?.onConversation?.({
                conversation_id: conversationId,
                title: conversationTitle,
              });
            }
            break;
          }
          case "token": {
            const token = payload as { delta?: string };
            if (typeof token.delta === "string" && token.delta.length > 0) {
              emitSplit(token.delta);
            }
            break;
          }
          case "done": {
            const donePayload = payload as {
              reply?: string;
              conversation_id?: string;
              title?: string;
            };
            // Flush any buffered tag-prefix as its current mode.
            const tail = splitter.flush();
            for (const tok of tail) {
              if (tok.kind === "content") {
                handlers?.onToken?.(tok.text);
              } else {
                handlers?.onReasoningDelta?.(tok.text);
              }
            }
            reply = typeof donePayload.reply === "string" ? donePayload.reply : "";
            if (typeof donePayload.conversation_id === "string") {
              conversationId = donePayload.conversation_id;
            }
            if (typeof donePayload.title === "string") {
              conversationTitle = donePayload.title;
            }
            return {
              reply,
              traceId,
              conversationId,
              conversationTitle,
            };
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

  throw new Error("Stream ended without a complete response");
}
