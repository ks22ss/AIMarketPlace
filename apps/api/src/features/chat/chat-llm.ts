import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";

function resolveChatApiKey(): string | null {
  const apiKey =
    process.env.CHAT_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.MINIMAX_API_KEY?.trim();
  return apiKey || null;
}

function resolveChatBaseUrl(): string {
  return (
    process.env.CHAT_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.openai.com/v1"
  );
}

/**
 * LangChain chat model for skill execution (LangSmith traces when LANGSMITH_* env is set).
 * Same key/base URL resolution as {@link createChatClientFromEnv}.
 */
export function createChatModelFromEnv(): ChatOpenAI | null {
  const apiKey = resolveChatApiKey();
  if (!apiKey) {
    return null;
  }

  const baseURL = resolveChatBaseUrl();

  return new ChatOpenAI({
    model: getChatModelId(),
    temperature: getChatTemperature(),
    apiKey,
    configuration: { baseURL },
  });
}

/**
 * OpenAI-compatible client for **chat** completions (separate from embedding keys/URLs).
 * Falls back to OPENAI_* when CHAT_* unset.
 */
export function createChatClientFromEnv(): OpenAI | null {
  const apiKey = resolveChatApiKey();
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey, baseURL: resolveChatBaseUrl() });
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
