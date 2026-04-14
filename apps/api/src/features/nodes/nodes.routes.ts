import { Router } from "express";
import type { PrismaClient } from "@prisma/client";

import {
  nodeCreateBodySchema,
  type NodeCreateResponse,
  type NodesListResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { effectiveOrgId, userMatchesAllowLists } from "./access.js";
import { isSystemNodeName } from "../../lib/agent/runtime.js";
import { isValidNodeName } from "../../lib/agent/node-naming.js";
import { asyncHandler } from "../../lib/async-handler.js";

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

    const accessUser = { role: user.role, department: user.department.name };
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

    try {
      const created = await prisma.node.create({
        data: {
          name,
          description,
          promptTemplate,
          createdBy: user.userId,
          orgId: org,
          allowRole: parsed.data.allow_role ?? [],
          allowDepartment: parsed.data.allow_department ?? [],
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

  return router;
}
