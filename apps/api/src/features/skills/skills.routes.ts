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
  type SkillUninstallResponse,
} from "../../contracts/public-api.js";
import { accessSummaryForSkill } from "../../lib/access-summary.js";
import { DEFAULT_ORG_ID } from "../../lib/org-config.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { effectiveOrgId, userMatchesAllowLists } from "../nodes/access.js";
import { isSystemNodeName } from "../../lib/agent/runtime.js";
import { asyncHandler } from "../../lib/async-handler.js";
import {
  findVisibleSkillsForUser,
  parseStoredSkillNodes,
  skillVisibleToUser,
  type SkillVisibilityUser,
} from "./skill-queries.js";

const SKILL_NODES_MAX = 10;

function installedOnlyFromQuery(query: Request["query"]): boolean {
  const raw = query.installed_only;
  return raw === "true" || raw === "1" || raw === "yes";
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
      select: {
        userId: true,
        orgId: true,
        role: true,
        department: { select: { name: true } },
      },
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
    const accessUser = { role: user.role, department: user.department.name };

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

    let allowDepartment: string[] = [];
    const deptIds = parsed.data.allow_department_ids;
    if (deptIds !== undefined && deptIds.length > 0) {
      const found = await prisma.department.findMany({
        where: { departmentId: { in: deptIds } },
        select: { departmentId: true, name: true },
      });
      if (found.length !== deptIds.length) {
        response.status(400).json({ error: "Invalid allow_department_ids" });
        return;
      }
      allowDepartment = found.map((d) => d.name);
    }

    let allowRole: string[] = [];
    const roleSlugs = parsed.data.allow_role_slugs;
    if (roleSlugs !== undefined && roleSlugs.length > 0) {
      const found = await prisma.role.findMany({
        where: { slug: { in: roleSlugs } },
        select: { slug: true },
      });
      if (found.length !== roleSlugs.length) {
        response.status(400).json({ error: "Invalid allow_role_slugs" });
        return;
      }
      allowRole = found.map((r) => r.slug);
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
        orgId: DEFAULT_ORG_ID,
        allowRole,
        allowDepartment,
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

    const result = await findVisibleSkillsForUser(prisma, auth.userId);
    if (!result) {
      response.status(401).json({ error: "User not found" });
      return;
    }

    let skills = result.skills;
    if (installedOnlyFromQuery(request.query)) {
      const installedRows = await prisma.userSkill.findMany({
        where: { userId: auth.userId },
        select: { skillId: true },
      });
      const installedSet = new Set(installedRows.map((r) => r.skillId));
      skills = skills.filter((s) => installedSet.has(s.skillId));
    }

    const payload: SkillsListResponse = {
      skills: skills.map((s) => ({
        skill_id: s.skillId,
        name: s.name,
        description: s.description,
        nodes: parseStoredSkillNodes(s.skillNodes),
        org_id: s.orgId,
        created_at: s.createdAt.toISOString(),
        access_summary: accessSummaryForSkill(s.allowRole, s.allowDepartment),
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

  router.post("/install", requireAuth, asyncHandler(async (request, response) => {
    const parsed = skillInstallBodySchema.safeParse(request.body);
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
      select: {
        userId: true,
        orgId: true,
        role: true,
        department: { select: { name: true } },
      },
    });
    if (!user) {
      response.status(401).json({ error: "User not found" });
      return;
    }

    const visibilityUser: SkillVisibilityUser = {
      userId: user.userId,
      orgId: user.orgId,
      role: user.role,
      department: user.department.name,
    };

    const skill = await prisma.skill.findUnique({
      where: { skillId: parsed.data.skill_id },
    });
    if (!skill) {
      response.status(404).json({ error: "Skill not found" });
      return;
    }

    if (!skillVisibleToUser(skill, visibilityUser)) {
      response.status(403).json({ error: "Forbidden", detail: "You cannot install this skill." });
      return;
    }

    const payload: SkillInstallResponse = {
      installed: true,
      skill_id: skill.skillId,
    };

    try {
      await prisma.userSkill.create({
        data: {
          userId: auth.userId,
          skillId: skill.skillId,
        },
      });
      response.status(201).json(payload);
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
      if (code === "P2002") {
        response.status(200).json(payload);
        return;
      }
      throw error;
    }
  }));

  router.delete(
    "/install/:skillId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const parsedId = z.string().uuid().safeParse(request.params.skillId);
      if (!parsedId.success) {
        response.status(400).json({ error: "Invalid skill id" });
        return;
      }

      const auth = request.authUser;
      if (!auth) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const deleted = await prisma.userSkill.deleteMany({
        where: {
          userId: auth.userId,
          skillId: parsedId.data,
        },
      });

      if (deleted.count === 0) {
        response.status(404).json({ error: "Install not found" });
        return;
      }

      const body: SkillUninstallResponse = {
        uninstalled: true,
        skill_id: parsedId.data,
      };
      response.json(body);
    }),
  );

  return router;
}
