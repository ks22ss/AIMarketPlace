import type { PrismaClient } from "@prisma/client";
import { Router } from "express";

import {
  chatConversationRenameBodySchema,
  type ChatConversationDeleteResponse,
  type ChatConversationDto,
  type ChatConversationRenameResponse,
  type ChatConversationsListResponse,
  type ChatConversationSummaryDto,
} from "../../contracts/public-api.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { effectiveOrgId } from "../nodes/access.js";
import { toConversationDto, toSummaryDto } from "./chat-history.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createChatConversationsRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth,
    asyncHandler(async (request, response) => {
      const auth = request.authUser;
      if (!auth) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const rows = await prisma.chatConversation.findMany({
        where: { userId: auth.userId },
        orderBy: { updatedAt: "desc" },
        select: {
          conversationId: true,
          title: true,
          skillId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      const payload: ChatConversationsListResponse = {
        conversations: rows.map<ChatConversationSummaryDto>(toSummaryDto),
      };
      response.json(payload);
    }),
  );

  router.get(
    "/:conversationId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const auth = request.authUser;
      if (!auth) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const id = request.params.conversationId;
      if (!UUID_RE.test(id)) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { userId: auth.userId },
        select: { userId: true, orgId: true },
      });
      if (!user) {
        response.status(401).json({ error: "User not found" });
        return;
      }

      const row = await prisma.chatConversation.findUnique({
        where: { conversationId: id },
      });
      if (!row || row.userId !== auth.userId) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }
      // Tenancy guard: if conversation was created under an org, require a match.
      const org = effectiveOrgId(user);
      if (row.orgId && row.orgId !== org && row.orgId !== user.orgId) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }

      const payload: ChatConversationDto = toConversationDto(row);
      response.json(payload);
    }),
  );

  router.patch(
    "/:conversationId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const auth = request.authUser;
      if (!auth) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const id = request.params.conversationId;
      if (!UUID_RE.test(id)) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }

      const parsed = chatConversationRenameBodySchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ error: "Invalid request body", details: parsed.error.flatten() });
        return;
      }

      const existing = await prisma.chatConversation.findUnique({
        where: { conversationId: id },
        select: { conversationId: true, userId: true },
      });
      if (!existing || existing.userId !== auth.userId) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }

      const title = parsed.data.title.trim();
      if (title.length === 0) {
        response.status(400).json({ error: "Title cannot be empty" });
        return;
      }

      const updated = await prisma.chatConversation.update({
        where: { conversationId: id },
        data: { title },
        select: { conversationId: true, title: true },
      });

      const payload: ChatConversationRenameResponse = {
        conversation_id: updated.conversationId,
        title: updated.title,
      };
      response.json(payload);
    }),
  );

  router.delete(
    "/:conversationId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const auth = request.authUser;
      if (!auth) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const id = request.params.conversationId;
      if (!UUID_RE.test(id)) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }

      const existing = await prisma.chatConversation.findUnique({
        where: { conversationId: id },
        select: { conversationId: true, userId: true },
      });
      if (!existing || existing.userId !== auth.userId) {
        response.status(404).json({ error: "Conversation not found" });
        return;
      }

      await prisma.chatConversation.delete({ where: { conversationId: id } });
      const payload: ChatConversationDeleteResponse = {
        deleted: true,
        conversation_id: id,
      };
      response.json(payload);
    }),
  );

  return router;
}
