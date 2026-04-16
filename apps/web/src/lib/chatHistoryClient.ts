import { resolveApiUrl } from "@/apiBase";

export type ChatConversationSummary = {
  conversation_id: string;
  title: string;
  skill_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ChatConversationMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace_id?: string;
  created_at: string;
};

export type ChatConversation = {
  conversation_id: string;
  title: string;
  skill_id: string | null;
  created_at: string;
  updated_at: string;
  messages: ChatConversationMessage[];
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

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function listConversations(
  accessToken: string,
): Promise<ChatConversationSummary[]> {
  const response = await fetch(resolveApiUrl("/api/chat/conversations"), {
    headers: authHeaders(accessToken),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  const body = (await response.json()) as { conversations: ChatConversationSummary[] };
  return body.conversations;
}

export async function getConversation(
  accessToken: string,
  conversationId: string,
): Promise<ChatConversation> {
  const response = await fetch(
    resolveApiUrl(`/api/chat/conversations/${conversationId}`),
    { headers: authHeaders(accessToken) },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as ChatConversation;
}

export async function renameConversation(
  accessToken: string,
  conversationId: string,
  title: string,
): Promise<{ conversation_id: string; title: string }> {
  const response = await fetch(
    resolveApiUrl(`/api/chat/conversations/${conversationId}`),
    {
      method: "PATCH",
      headers: { ...authHeaders(accessToken), "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as { conversation_id: string; title: string };
}

export async function deleteConversation(
  accessToken: string,
  conversationId: string,
): Promise<void> {
  const response = await fetch(
    resolveApiUrl(`/api/chat/conversations/${conversationId}`),
    { method: "DELETE", headers: authHeaders(accessToken) },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}
