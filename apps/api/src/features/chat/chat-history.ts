import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import type {
  ChatConversationDto,
  ChatConversationMessageDto,
  ChatConversationSummaryDto,
} from "../../contracts/public-api.js";

/** Shape stored inside `chat_conversations.messages` JSON. */
export type StoredChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  traceId?: string;
  createdAt: string;
};

const STRIP_THINK_RE = /<think>[\s\S]*?<\/think>/gi;

/**
 * Build a default conversation title from the assistant reply.
 * Strips any `<think>...</think>` blocks, then takes the first 6 words up to 48 chars.
 */
export function deriveConversationTitle(reply: string): string {
  const visible = reply.replace(STRIP_THINK_RE, "").replace(/\s+/g, " ").trim();
  if (visible.length === 0) {
    return "New chat";
  }
  const words = visible.split(" ").slice(0, 6).join(" ");
  const truncated = words.length > 48 ? `${words.slice(0, 45).trimEnd()}...` : words;
  return truncated;
}

export function newMessageId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function parseStoredMessages(value: unknown): StoredChatMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const messages: StoredChatMessage[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const raw = item as Record<string, unknown>;
    const role = raw.role;
    const content = raw.content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") {
      continue;
    }
    const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : newMessageId();
    const createdAt =
      typeof raw.createdAt === "string" && raw.createdAt.length > 0 ? raw.createdAt : nowIso();
    const traceId = typeof raw.traceId === "string" ? raw.traceId : undefined;
    messages.push({ id, role, content, traceId, createdAt });
  }
  return messages;
}

export function toMessageDto(message: StoredChatMessage): ChatConversationMessageDto {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    trace_id: message.traceId,
    created_at: message.createdAt,
  };
}

export function toSummaryDto(row: {
  conversationId: string;
  title: string;
  skillId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ChatConversationSummaryDto {
  return {
    conversation_id: row.conversationId,
    title: row.title,
    skill_id: row.skillId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export function toConversationDto(row: {
  conversationId: string;
  title: string;
  skillId: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages: unknown;
}): ChatConversationDto {
  return {
    conversation_id: row.conversationId,
    title: row.title,
    skill_id: row.skillId,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
    messages: parseStoredMessages(row.messages).map(toMessageDto),
  };
}

export type UpsertConversationArgs = {
  prisma: PrismaClient;
  userId: string;
  orgId: string | null;
  conversationId: string | null;
  skillId: string | null;
  userMessage: StoredChatMessage;
  assistantMessage: StoredChatMessage;
};

/**
 * Append a (user, assistant) pair to an existing conversation or create a new one.
 * Returns the resulting conversation id and current title.
 */
export async function upsertConversationTurn(
  args: UpsertConversationArgs,
): Promise<{ conversationId: string; title: string }> {
  const { prisma, userId, orgId, conversationId, skillId, userMessage, assistantMessage } = args;

  if (conversationId) {
    const existing = await prisma.chatConversation.findUnique({
      where: { conversationId },
      select: { userId: true },
    });
    if (existing && existing.userId === userId) {
      // Atomic jsonb array append so concurrent turns cannot overwrite each other (read-modify-write race).
      const pair = [userMessage, assistantMessage];
      const appendJson = JSON.stringify(pair);
      const updatedRows = await prisma.$executeRaw`
        UPDATE "chat_conversations"
        SET
          "messages" = COALESCE("messages", '[]'::jsonb) || ${appendJson}::jsonb,
          "updated_at" = CURRENT_TIMESTAMP
        WHERE "conversation_id" = ${conversationId}::uuid
          AND "user_id" = ${userId}::uuid
      `;
      if (updatedRows > 0) {
        const updated = await prisma.chatConversation.findUniqueOrThrow({
          where: { conversationId },
          select: { conversationId: true, title: true },
        });
        return { conversationId: updated.conversationId, title: updated.title };
      }
      // Row existed at read time but disappeared before update (rare); avoid creating a forked thread.
      throw new Error("Conversation not found or could not be updated");
    }
  }

  const title = deriveConversationTitle(assistantMessage.content);
  const created = await prisma.chatConversation.create({
    data: {
      userId,
      orgId,
      title,
      skillId,
      messages: [userMessage, assistantMessage] as unknown as Prisma.InputJsonValue,
    },
  });
  return { conversationId: created.conversationId, title: created.title };
}
