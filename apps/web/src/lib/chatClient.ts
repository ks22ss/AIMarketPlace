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
