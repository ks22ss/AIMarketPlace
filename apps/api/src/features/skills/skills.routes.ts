import type { Prisma, PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import {
  skillCreateBodySchema,
  type SkillCreateResponse,
  skillInstallBodySchema,
  type SkillInstallResponse,
  type SkillsListResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { effectiveOrgId, userMatchesAllowLists } from "../nodes/access.js";
import { isSystemNodeName } from "../../lib/agent/runtime.js";
import { asyncHandler } from "../../lib/async-handler.js";

const SKILL_NODES_MAX = 10;

function parseStoredSkillNodes(value: unknown): string[] {
  const parsed = z.array(z.string().min(1).max(200)).max(SKILL_NODES_MAX).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function createSkillsRouter(prisma: PrismaClient): Router {
  const router = Router();

  async function postCreateSkill(request: Request, response: Response): Promise<void> {
    const parsed = skillCreateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const auth = request.authUser;
    if (!auth) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { userId: auth.userId },
      select: { userId: true, orgId: true, role: true, department: true },
    });
    if (!user) {
      response.status(401).json({ error: "User not found" });
      return;
    }

    const nodes = parsed.data.nodes;
    if (nodes.length < 1 || nodes.length > SKILL_NODES_MAX) {
      response.status(400).json({
        error: "Invalid nodes",
        detail: `Provide between 1 and ${SKILL_NODES_MAX} node names.`,
      });
      return;
    }

    const org = effectiveOrgId(user);
    const accessUser = { role: user.role, department: user.department };

    for (const nodeName of nodes) {
      if (isSystemNodeName(nodeName)) {
        continue;
      }
      const node = await prisma.node.findFirst({
        where: { orgId: org, name: nodeName },
      });
      if (!node) {
        response.status(400).json({
          error: "Unknown node",
          detail: `No node named "${nodeName}" in your organization.`,
        });
        return;
      }
      if (!userMatchesAllowLists(accessUser, node.allowRole, node.allowDepartment)) {
        response.status(403).json({
          error: "Forbidden",
          detail: `You do not have access to node "${nodeName}".`,
        });
        return;
      }
    }

    const description =
      parsed.data.description === undefined || parsed.data.description === null
        ? null
        : String(parsed.data.description).replace(/\x00/g, "").slice(0, 8000);

    const created = await prisma.skill.create({
      data: {
        name: parsed.data.name.trim(),
        description,
        content: (parsed.data.content ?? {}) as Prisma.InputJsonValue,
        skillNodes: nodes,
        createdBy: user.userId,
        orgId: org,
        allowRole: parsed.data.allow_role ?? [],
        allowDepartment: parsed.data.allow_department ?? [],
      },
    });

    const payload: SkillCreateResponse = {
      skill_id: created.skillId,
      name: created.name,
      version: created.version,
      nodes: parseStoredSkillNodes(created.skillNodes),
    };
    response.status(201).json(payload);
  }

  router.get("/", requireAuth, asyncHandler(async (request, response) => {
    const auth = request.authUser;
    if (!auth) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { userId: auth.userId },
      select: { userId: true, orgId: true, role: true, department: true },
    });
    if (!user) {
      response.status(401).json({ error: "User not found" });
      return;
    }

    const org = effectiveOrgId(user);
    const rows = await prisma.skill.findMany({
      where: {
        OR: [{ orgId: org }, { orgId: null, createdBy: user.userId }],
      },
      orderBy: { createdAt: "desc" },
    });

    const accessUser = { role: user.role, department: user.department };
    const visible = rows.filter((row) =>
      userMatchesAllowLists(accessUser, row.allowRole, row.allowDepartment),
    );

    const payload: SkillsListResponse = {
      skills: visible.map((s) => ({
        skill_id: s.skillId,
        name: s.name,
        description: s.description,
        nodes: parseStoredSkillNodes(s.skillNodes),
        org_id: s.orgId,
        created_at: s.createdAt.toISOString(),
      })),
    };
    response.json(payload);
  }));

  router.post("/", requireAuth, (request, response, next) => {
    void postCreateSkill(request, response).catch(next);
  });

  /** @deprecated Prefer POST /api/skills */
  router.post("/create", requireAuth, (request, response, next) => {
    void postCreateSkill(request, response).catch(next);
  });

  router.post("/install", requireAuth, (request, response) => {
    const parsed = skillInstallBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload: SkillInstallResponse = {
      installed: true,
      skill_id: parsed.data.skill_id,
    };
    response.status(201).json(payload);
  });

  return router;
}
