import OpenAI from "openai";

/**
 * OpenAI-compatible client for **chat** completions (separate from embedding keys/URLs).
 * Falls back to OPENAI_* when CHAT_* unset.
 */
export function createChatClientFromEnv(): OpenAI | null {
  const apiKey =
    process.env.CHAT_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.DEEPINFRA_API_KEY?.trim() ||
    process.env.DEEPINFRA_TOKEN?.trim();
  if (!apiKey) {
    return null;
  }

  const baseURL =
    process.env.CHAT_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    process.env.EMBEDDING_BASE_URL?.trim() ||
    "https://api.openai.com/v1";

  return new OpenAI({ apiKey, baseURL });
}

export function getChatModelId(): string {
  return process.env.LLM_MODEL?.trim() || "gpt-4o-mini";
}

export function getChatTemperature(): number {
  const raw = process.env.CHAT_TEMPERATURE?.trim();
  if (!raw) {
    return 0.2;
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return 0.2;
  }
  return Math.min(2, Math.max(0, value));
}
