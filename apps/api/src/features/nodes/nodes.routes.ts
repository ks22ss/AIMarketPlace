import { Router } from "express";
import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";

import {
  nodeCreateBodySchema,
  nodeUpdateBodySchema,
  type NodeCreateResponse,
  type NodeDeleteResponse,
  type NodesListResponse,
  type NodeUpdateResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { effectiveOrgId, userMatchesAllowLists } from "./access.js";
import { isSystemNodeName } from "../../lib/agent/runtime.js";
import { isValidNodeName } from "../../lib/agent/node-naming.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { resolveAllowLists } from "../../lib/resolve-allow-lists.js";
import { normalizeUserRoleSlug } from "../../lib/user-roles.js";
import { findSkillsReferencingNodeName } from "../skills/skill-queries.js";

const PROMPT_TEMPLATE_MAX = 24_000;
const DESCRIPTION_MAX = 8_000;

function sanitizePromptTemplate(raw: string): string {
  return raw.replace(/\x00/g, "").slice(0, PROMPT_TEMPLATE_MAX);
}

export function createNodesRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get("/", requireAuth, asyncHandler(async (request, response) => {
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

    const org = effectiveOrgId(user);
    const rows = await prisma.node.findMany({
      where: { orgId: org },
      orderBy: { name: "asc" },
    });

    const accessUser = { role: normalizeUserRoleSlug(user.role), department: user.department.name };
    const visible = rows.filter((row) =>
      userMatchesAllowLists(accessUser, row.allowRole, row.allowDepartment),
    );

    const payload: NodesListResponse = {
      nodes: visible.map((n) => ({
        node_id: n.nodeId,
        name: n.name,
        description: n.description,
        prompt_template: n.promptTemplate,
        created_by: n.createdBy,
        org_id: n.orgId,
        allow_role: n.allowRole,
        allow_department: n.allowDepartment,
        created_at: n.createdAt.toISOString(),
      })),
    };
    response.json(payload);
  }));

  router.post("/", requireAuth, asyncHandler(async (request, response) => {
    const parsed = nodeCreateBodySchema.safeParse(request.body);
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
      select: { userId: true, orgId: true },
    });
    if (!user) {
      response.status(401).json({ error: "User not found" });
      return;
    }

    const name = parsed.data.name.trim();
    if (!isValidNodeName(name)) {
      response.status(400).json({
        error: "Invalid node name",
        detail: "Use lowercase snake_case (letters, digits, underscores).",
      });
      return;
    }

    if (isSystemNodeName(name)) {
      response.status(400).json({
        error: "Reserved name",
        detail: `"${name}" is a system node and cannot be created manually.`,
      });
      return;
    }

    const promptTemplate = sanitizePromptTemplate(parsed.data.prompt_template);
    if (promptTemplate.length === 0) {
      response.status(400).json({ error: "prompt_template is required" });
      return;
    }

    const description =
      parsed.data.description === undefined || parsed.data.description === null
        ? null
        : String(parsed.data.description).replace(/\x00/g, "").slice(0, DESCRIPTION_MAX);

    const org = effectiveOrgId(user);

    const resolvedLists = await resolveAllowLists(prisma, {
      allow_department_ids: parsed.data.allow_department_ids,
      allow_role_slugs: parsed.data.allow_role_slugs,
      allow_department: parsed.data.allow_department,
      allow_role: parsed.data.allow_role,
    });
    if (!resolvedLists.ok) {
      response.status(400).json({ error: resolvedLists.error });
      return;
    }

    try {
      const created = await prisma.node.create({
        data: {
          name,
          description,
          promptTemplate,
          createdBy: user.userId,
          orgId: org,
          allowRole: resolvedLists.allowRole,
          allowDepartment: resolvedLists.allowDepartment,
        },
      });

      const payload: NodeCreateResponse = {
        node_id: created.nodeId,
        name: created.name,
      };
      response.status(201).json(payload);
    } catch (error: unknown) {
      const code = typeof error === "object" && error && "code" in error ? String((error as { code: string }).code) : "";
      if (code === "P2002") {
        response.status(409).json({ error: "Node name already exists for this organization" });
        return;
      }
      throw error;
    }
  }));


  router.patch(
    "/:nodeId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const parsedId = z.string().uuid().safeParse(request.params.nodeId);
      if (!parsedId.success) {
        response.status(400).json({ error: "Invalid node id" });
        return;
      }

      const parsed = nodeUpdateBodySchema.safeParse(request.body);
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

      const org = effectiveOrgId(user);
      const accessUser = { role: normalizeUserRoleSlug(user.role), department: user.department.name };

      const node = await prisma.node.findFirst({
        where: { nodeId: parsedId.data, orgId: org },
      });
      if (!node) {
        response.status(404).json({ error: "Node not found" });
        return;
      }
      if (!userMatchesAllowLists(accessUser, node.allowRole, node.allowDepartment)) {
        response.status(403).json({ error: "Forbidden", detail: "You cannot update this node." });
        return;
      }

      const data: Prisma.NodeUpdateInput = {};
      if (parsed.data.description !== undefined) {
        data.description =
          parsed.data.description === null
            ? null
            : String(parsed.data.description).replace(/\x00/g, "").slice(0, DESCRIPTION_MAX);
      }
      if (parsed.data.prompt_template !== undefined) {
        const promptTemplate = sanitizePromptTemplate(parsed.data.prompt_template);
        if (promptTemplate.length === 0) {
          response.status(400).json({ error: "prompt_template is required" });
          return;
        }
        data.promptTemplate = promptTemplate;
      }
      if (
        parsed.data.allow_department_ids !== undefined ||
        parsed.data.allow_role_slugs !== undefined ||
        parsed.data.allow_department !== undefined ||
        parsed.data.allow_role !== undefined
      ) {
        const resolvedLists = await resolveAllowLists(prisma, {
          allow_department_ids: parsed.data.allow_department_ids,
          allow_role_slugs: parsed.data.allow_role_slugs,
          allow_department: parsed.data.allow_department,
          allow_role: parsed.data.allow_role,
        });
        if (!resolvedLists.ok) {
          response.status(400).json({ error: resolvedLists.error });
          return;
        }
        data.allowRole = resolvedLists.allowRole;
        data.allowDepartment = resolvedLists.allowDepartment;
      }

      const updated = await prisma.node.update({
        where: { nodeId: node.nodeId },
        data,
      });

      const payload: NodeUpdateResponse = {
        node_id: updated.nodeId,
        name: updated.name,
        description: updated.description,
        prompt_template: updated.promptTemplate,
        created_by: updated.createdBy,
        org_id: updated.orgId,
        allow_role: updated.allowRole,
        allow_department: updated.allowDepartment,
        created_at: updated.createdAt.toISOString(),
      };
      response.json(payload);
    }),
  );

  router.delete(
    "/:nodeId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const parsedId = z.string().uuid().safeParse(request.params.nodeId);
      if (!parsedId.success) {
        response.status(400).json({ error: "Invalid node id" });
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

      const org = effectiveOrgId(user);
      const accessUser = { role: normalizeUserRoleSlug(user.role), department: user.department.name };

      const node = await prisma.node.findFirst({
        where: { nodeId: parsedId.data, orgId: org },
      });
      if (!node) {
        response.status(404).json({ error: "Node not found" });
        return;
      }
      if (!userMatchesAllowLists(accessUser, node.allowRole, node.allowDepartment)) {
        response.status(403).json({ error: "Forbidden", detail: "You cannot delete this node." });
        return;
      }

      const blockingSkills = await findSkillsReferencingNodeName(prisma, node.orgId, node.name);
      if (blockingSkills.length > 0) {
        response.status(409).json({
          error: "NodeInUse",
          detail:
            "This node is still used by one or more skills. Remove it from every affected skill workflow (or delete those skills) before deleting the node.",
          blocking_skills: blockingSkills,
        });
        return;
      }

      await prisma.node.delete({ where: { nodeId: node.nodeId } });
      const body: NodeDeleteResponse = { deleted: true, node_id: node.nodeId };
      response.json(body);
    }),
  );
  return router;
}
