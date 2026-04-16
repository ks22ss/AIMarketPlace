import type { Prisma, PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import {
  skillCreateBodySchema,
  skillUpdateBodySchema,
  type SkillCreateResponse,
  type SkillDeleteResponse,
  skillInstallBodySchema,
  type SkillInstallResponse,
  type SkillsListResponse,
  type SkillUninstallResponse,
  type SkillUpdateResponse,
} from "../../contracts/public-api.js";
import { accessSummaryForSkill } from "../../lib/access-summary.js";
import { DEFAULT_ORG_ID } from "../../lib/org-config.js";
import { resolveAllowLists } from "../../lib/resolve-allow-lists.js";
import { normalizeUserRoleSlug } from "../../lib/user-roles.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { effectiveOrgId } from "../nodes/access.js";
import { asyncHandler } from "../../lib/async-handler.js";
import {
  findVisibleSkillsForUser,
  parseStoredSkillNodes,
  skillVisibleToUser,
  validateSkillWorkflowNodes,
  type SkillVisibilityUser,
} from "./skill-queries.js";

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
    const org = effectiveOrgId(user);
    const accessUser = { role: normalizeUserRoleSlug(user.role), department: user.department.name };

    const workflowCheck = await validateSkillWorkflowNodes(prisma, org, accessUser, nodes);
    if (!workflowCheck.ok) {
      response.status(workflowCheck.status).json(workflowCheck.body);
      return;
    }
    const resolvedLists = await resolveAllowLists(prisma, {
      allow_department_ids: parsed.data.allow_department_ids,
      allow_role_slugs: parsed.data.allow_role_slugs,
    });
    if (!resolvedLists.ok) {
      response.status(400).json({ error: resolvedLists.error });
      return;
    }
    const { allowRole, allowDepartment } = resolvedLists;

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
        allow_role: s.allowRole,
        allow_department: s.allowDepartment,
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
      role: normalizeUserRoleSlug(user.role),
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


  router.patch(
    "/:skillId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const parsedId = z.string().uuid().safeParse(request.params.skillId);
      if (!parsedId.success) {
        response.status(400).json({ error: "Invalid skill id" });
        return;
      }

      const parsed = skillUpdateBodySchema.safeParse(request.body);
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
        role: normalizeUserRoleSlug(user.role),
        department: user.department.name,
      };

      const skill = await prisma.skill.findUnique({
        where: { skillId: parsedId.data },
      });
      if (!skill) {
        response.status(404).json({ error: "Skill not found" });
        return;
      }
      if (!skillVisibleToUser(skill, visibilityUser)) {
        response.status(403).json({ error: "Forbidden", detail: "You cannot update this skill." });
        return;
      }

      const org = effectiveOrgId(user);
      const accessUser = { role: normalizeUserRoleSlug(user.role), department: user.department.name };

      if (parsed.data.nodes !== undefined) {
        const workflowCheck = await validateSkillWorkflowNodes(prisma, org, accessUser, parsed.data.nodes);
        if (!workflowCheck.ok) {
          response.status(workflowCheck.status).json(workflowCheck.body);
          return;
        }
      }

      const data: Prisma.SkillUpdateInput = {};
      if (parsed.data.name !== undefined) {
        data.name = parsed.data.name.trim();
      }
      if (parsed.data.description !== undefined) {
        data.description =
          parsed.data.description === null
            ? null
            : String(parsed.data.description).replace(/\x00/g, "").slice(0, 8000);
      }
      if (parsed.data.nodes !== undefined) {
        data.skillNodes = parsed.data.nodes;
      }
      if (parsed.data.content !== undefined) {
        data.content = parsed.data.content as Prisma.InputJsonValue;
      }
      if (parsed.data.allow_department_ids !== undefined || parsed.data.allow_role_slugs !== undefined) {
        const resolvedLists = await resolveAllowLists(prisma, {
          allow_department_ids: parsed.data.allow_department_ids,
          allow_role_slugs: parsed.data.allow_role_slugs,
        });
        if (!resolvedLists.ok) {
          response.status(400).json({ error: resolvedLists.error });
          return;
        }
        data.allowRole = resolvedLists.allowRole;
        data.allowDepartment = resolvedLists.allowDepartment;
      }

      const updated = await prisma.skill.update({
        where: { skillId: parsedId.data },
        data,
      });

      const payload: SkillUpdateResponse = {
        skill_id: updated.skillId,
        name: updated.name,
        version: updated.version,
        nodes: parseStoredSkillNodes(updated.skillNodes),
      };
      response.json(payload);
    }),
  );

  router.delete(
    "/:skillId",
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
        role: normalizeUserRoleSlug(user.role),
        department: user.department.name,
      };

      const skill = await prisma.skill.findUnique({
        where: { skillId: parsedId.data },
      });
      if (!skill) {
        response.status(404).json({ error: "Skill not found" });
        return;
      }
      if (!skillVisibleToUser(skill, visibilityUser)) {
        response.status(403).json({ error: "Forbidden", detail: "You cannot delete this skill." });
        return;
      }

      await prisma.skill.delete({ where: { skillId: parsedId.data } });
      const body: SkillDeleteResponse = { deleted: true, skill_id: parsedId.data };
      response.json(body);
    }),
  );
  return router;
}
