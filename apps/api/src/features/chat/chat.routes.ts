import { randomUUID } from "node:crypto";

import type { ChatOpenAI } from "@langchain/openai";
import type { PrismaClient } from "@prisma/client";
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

async function resolveSkillForUser(
  prisma: PrismaClient,
  params: { org: string; skillId?: string },
) {
  if (params.skillId) {
    return prisma.skill.findFirst({
      where: {
        skillId: params.skillId,
        orgId: params.org,
      },
    });
  }

  return prisma.skill.findFirst({
    where: { orgId: params.org },
    orderBy: { createdAt: "desc" },
  });
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
        response.status(401).json({ error: "User not found" });
        return;
      }

      if (user.departmentId !== authUser.departmentId) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const org = effectiveOrgId(user);
      const skill = await resolveSkillForUser(deps.prisma, {
        org,
        skillId: parsed.data.skill_id,
      });

      if (!skill) {
        response.status(404).json({
          error: "No skill found",
          detail: "Create a skill in the Skill Builder or pass skill_id.",
        });
        return;
      }

      if (
        !userMatchesAllowLists(
          { role: normalizeUserRoleSlug(user.role), department: user.department.name },
          skill.allowRole,
          skill.allowDepartment,
        )
      ) {
        response.status(403).json({ error: "Forbidden", detail: "You cannot run this skill." });
        return;
      }

      const installRow = await deps.prisma.userSkill.findUnique({
        where: {
          userId_skillId: { userId: user.userId, skillId: skill.skillId },
        },
      });
      if (!installRow) {
        response.status(403).json({
          error: "Forbidden",
          detail: "Install this skill from the Marketplace before running it in chat.",
        });
        return;
      }

      const nodeNames = parseSkillNodes(skill.skillNodes);
      if (nodeNames.length === 0) {
        response.status(400).json({
          error: "Skill has no nodes",
          detail: "Update the skill to include at least one workflow step.",
        });
        return;
      }

      const traceId = randomUUID();

      const finalState = await runSkill(
        {
          prisma: deps.prisma,
          pipeline: deps.pipeline,
          chatModel: deps.chatModel,
          orgId: org,
        },
        nodeNames,
        {
          query: parsed.data.message,
          userId: user.userId,
          departmentId: user.departmentId,
          orgScope: org,
        },
      );

      const reply =
        finalState.output ??
        (typeof finalState.context === "string" && finalState.context.length > 0
          ? finalState.context
          : "(No output)");

      const payload: ChatPostResponse = {
        reply,
        traceId,
      };
      response.json(payload);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
