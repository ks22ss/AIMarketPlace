import { randomUUID } from "node:crypto";

import type { ChatOpenAI } from "@langchain/openai";
import type { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import {
  chatPostBodySchema,
  type ChatPostResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { effectiveOrgId, userMatchesAllowLists } from "../nodes/access.js";
import type { DocumentPipeline } from "../docs/document.pipeline.js";
import { runSkill } from "../../lib/agent/runtime.js";
import { normalizeUserRoleSlug } from "../../lib/user-roles.js";
import {
  newMessageId,
  nowIso,
  upsertConversationTurn,
  type StoredChatMessage,
} from "./chat-history.js";

export type ChatRouterDeps = {
  prisma: PrismaClient;
  pipeline: DocumentPipeline | null;
  chatModel: ChatOpenAI | null;
};

const skillNodesSchema = z.array(z.string().min(1).max(200)).max(10);

function parseSkillNodes(value: unknown): string[] {
  const parsed = skillNodesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

type PreparedChatUser = {
  userId: string;
  orgId: string | null;
  departmentId: string;
  role: string;
  department: { name: string };
};

type PrepareChatResult =
  | {
      ok: true;
      user: PreparedChatUser;
      org: string;
      nodeNames: string[];
      conversationId: string | null;
    }
  | { ok: false; status: number; body: Record<string, unknown> };

async function prepareChatExecution(
  deps: ChatRouterDeps,
  authUser: { userId: string; departmentId: string },
  body: z.infer<typeof chatPostBodySchema>,
): Promise<PrepareChatResult> {
  const user = await deps.prisma.user.findUnique({
    where: { userId: authUser.userId },
    select: {
      userId: true,
      orgId: true,
      departmentId: true,
      role: true,
      department: { select: { name: true } },
    },
  });
  if (!user) {
    return { ok: false, status: 401, body: { error: "User not found" } };
  }

  if (user.departmentId !== authUser.departmentId) {
    return { ok: false, status: 401, body: { error: "Unauthorized" } };
  }

  const org = effectiveOrgId(user);

  let nodeNames: string[] = [];

  if (body.skill_id) {
    const skill = await deps.prisma.skill.findFirst({
      where: {
        skillId: body.skill_id,
        orgId: org,
      },
    });

    if (!skill) {
      return {
        ok: false,
        status: 404,
        body: {
          error: "Skill not found",
          detail: "Check skill_id or pick another skill.",
        },
      };
    }

    if (
      !userMatchesAllowLists(
        { role: normalizeUserRoleSlug(user.role), department: user.department.name },
        skill.allowRole,
        skill.allowDepartment,
      )
    ) {
      return { ok: false, status: 403, body: { error: "Forbidden", detail: "You cannot run this skill." } };
    }

    const installRow = await deps.prisma.userSkill.findUnique({
      where: {
        userId_skillId: { userId: user.userId, skillId: skill.skillId },
      },
    });
    if (!installRow) {
      return {
        ok: false,
        status: 403,
        body: {
          error: "Forbidden",
          detail: "Install this skill from the Marketplace before using it in chat.",
        },
      };
    }

    nodeNames = parseSkillNodes(skill.skillNodes);
  }

  let conversationId: string | null = null;
  if (body.conversation_id) {
    const existing = await deps.prisma.chatConversation.findUnique({
      where: { conversationId: body.conversation_id },
      select: { conversationId: true, userId: true },
    });
    if (!existing || existing.userId !== user.userId) {
      return {
        ok: false,
        status: 404,
        body: { error: "Conversation not found" },
      };
    }
    conversationId = existing.conversationId;
  }

  return { ok: true, user, org, nodeNames, conversationId };
}

function wantsChatSse(request: Request): boolean {
  const accept = request.headers.accept ?? "";
  return accept.includes("text/event-stream");
}

function writeSseEvent(response: Response, event: string, data: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function beginSse(response: Response): void {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.setHeader("X-Accel-Buffering", "no");
  const res = response as Response & { flushHeaders?: () => void };
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }
}

function resolveReplyFromFinalState(output: unknown): string {
  return typeof output === "string" && output.trim().length > 0 ? output.trim() : "(No output)";
}

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();

  router.post("/", requireAuth, async (request, response, next) => {
    try {
      const parsed = chatPostBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          error: "Invalid request body",
          details: parsed.error.flatten(),
        });
        return;
      }

      if (!deps.chatModel) {
        response.status(503).json({
          error: "Chat is not configured",
          detail:
            "Set CHAT_API_KEY or OPENAI_API_KEY (and CHAT_BASE_URL / OPENAI_BASE_URL for MiniMax) plus LLM_MODEL.",
        });
        return;
      }

      const authUser = request.authUser;
      if (!authUser) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const prepared = await prepareChatExecution(deps, authUser, parsed.data);
      if (!prepared.ok) {
        response.status(prepared.status).json(prepared.body);
        return;
      }

      const { user, org, nodeNames, conversationId } = prepared;
      const chatModel = deps.chatModel;
      const traceId = randomUUID();
      const userMessage: StoredChatMessage = {
        id: newMessageId(),
        role: "user",
        content: parsed.data.message,
        createdAt: nowIso(),
      };
      const skillIdForPersist = parsed.data.skill_id ?? null;

      const runSkillBase = {
        prisma: deps.prisma,
        pipeline: deps.pipeline,
        chatModel,
        orgId: org,
      };

      const initial = {
        query: parsed.data.message,
        userId: user.userId,
        departmentId: user.departmentId,
        orgScope: org,
      };

      async function persistTurn(reply: string): Promise<{ conversationId: string; title: string }> {
        const assistantMessage: StoredChatMessage = {
          id: newMessageId(),
          role: "assistant",
          content: reply,
          traceId,
          createdAt: nowIso(),
        };
        return upsertConversationTurn({
          prisma: deps.prisma,
          userId: user.userId,
          orgId: user.orgId,
          conversationId,
          skillId: skillIdForPersist,
          userMessage,
          assistantMessage,
        });
      }

      if (wantsChatSse(request)) {
        beginSse(response);
        writeSseEvent(response, "meta", { trace_id: traceId });
        try {
          const finalState = await runSkill(
            {
              ...runSkillBase,
              onFinalLlmToken: (delta) => writeSseEvent(response, "token", { delta }),
            },
            nodeNames,
            initial,
          );
          const reply = resolveReplyFromFinalState(finalState.output);
          const persisted = await persistTurn(reply);
          writeSseEvent(response, "conversation", {
            conversation_id: persisted.conversationId,
            title: persisted.title,
          });
          writeSseEvent(response, "done", {
            reply,
            conversation_id: persisted.conversationId,
            title: persisted.title,
          });
          response.end();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Chat failed";
          writeSseEvent(response, "error", { message });
          response.end();
        }
        return;
      }

      const finalState = await runSkill(runSkillBase, nodeNames, initial);

      const reply = resolveReplyFromFinalState(finalState.output);
      const persisted = await persistTurn(reply);

      const payload: ChatPostResponse = {
        reply,
        traceId,
        conversationId: persisted.conversationId,
        conversationTitle: persisted.title,
      };
      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
