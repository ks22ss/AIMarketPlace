import type { PrismaClient, Skill } from "@prisma/client";
import { z } from "zod";

import { isSystemNodeName } from "../../lib/agent/runtime.js";
import { DEFAULT_ORG_ID } from "../../lib/org-config.js";
import { normalizeUserRoleSlug } from "../../lib/user-roles.js";
import { effectiveOrgId, userMatchesAllowLists, type AccessUser } from "../nodes/access.js";

export const SKILL_NODES_MAX = 10;

export function parseStoredSkillNodes(value: unknown): string[] {
  const parsed = z.array(z.string().min(1).max(200)).max(SKILL_NODES_MAX).safeParse(value);
  return parsed.success ? parsed.data : [];
}


export type BlockingSkillSummary = { skill_id: string; name: string };

export function blockingSkillsForNodeName(
  rows: Array<{ skillId: string; name: string; skillNodes: unknown }>,
  nodeName: string,
): BlockingSkillSummary[] {
  const out: BlockingSkillSummary[] = [];
  for (const row of rows) {
    if (parseStoredSkillNodes(row.skillNodes).includes(nodeName)) {
      out.push({ skill_id: row.skillId, name: row.name });
    }
  }
  return out;
}

export async function findSkillsReferencingNodeName(
  prisma: PrismaClient,
  orgId: string,
  nodeName: string,
): Promise<BlockingSkillSummary[]> {
  const rows = await prisma.skill.findMany({
    where: { orgId },
    select: { skillId: true, name: true, skillNodes: true },
  });
  return blockingSkillsForNodeName(rows, nodeName);
}

export type SkillWorkflowValidationFailure = {
  ok: false;
  status: 400 | 403;
  body: Record<string, unknown>;
};

export type SkillWorkflowValidationSuccess = { ok: true };

export async function validateSkillWorkflowNodes(
  prisma: PrismaClient,
  orgId: string,
  accessUser: AccessUser,
  nodes: string[],
): Promise<SkillWorkflowValidationSuccess | SkillWorkflowValidationFailure> {
  if (nodes.length < 1 || nodes.length > SKILL_NODES_MAX) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "Invalid nodes",
        detail: "Provide between 1 and " + SKILL_NODES_MAX + " node names.",
      },
    };
  }

  for (const nodeName of nodes) {
    if (isSystemNodeName(nodeName)) {
      continue;
    }
    const node = await prisma.node.findFirst({
      where: { orgId, name: nodeName },
    });
    if (!node) {
      return {
        ok: false,
        status: 400,
        body: {
          error: "Unknown node",
          detail: 'No node named "' + nodeName + '" in your organization.',
        },
      };
    }
    if (!userMatchesAllowLists(accessUser, node.allowRole, node.allowDepartment)) {
      return {
        ok: false,
        status: 403,
        body: {
          error: "Forbidden",
          detail: 'You do not have access to node "' + nodeName + '".',
        },
      };
    }
  }

  return { ok: true };
}

export type SkillVisibilityUser = {
  userId: string;
  orgId: string | null;
  role: string;
  /** Department name (matches `Skill.allowDepartment` entries). */
  department: string | null;
};

export function skillVisibleToUser(skill: Skill, user: SkillVisibilityUser): boolean {
  const org = effectiveOrgId(user);
  if (skill.orgId !== org) {
    return false;
  }
  const accessUser: AccessUser = { role: normalizeUserRoleSlug(user.role), department: user.department };
  return userMatchesAllowLists(accessUser, skill.allowRole, skill.allowDepartment);
}

/** Skills in the default org the user may use, filtered by role/department allow lists. */
export async function findVisibleSkillsForUser(
  prisma: PrismaClient,
  authUserId: string,
): Promise<{ user: SkillVisibilityUser; skills: Skill[] } | null> {
  const user = await prisma.user.findUnique({
    where: { userId: authUserId },
    select: {
      userId: true,
      orgId: true,
      role: true,
      department: { select: { name: true } },
    },
  });
  if (!user) {
    return null;
  }

  const rows = await prisma.skill.findMany({
    where: { orgId: DEFAULT_ORG_ID },
    orderBy: { createdAt: "desc" },
  });

  const visibilityUser: SkillVisibilityUser = {
    userId: user.userId,
    orgId: user.orgId,
    role: user.role,
    department: user.department.name,
  };

  const skills = rows.filter((row) => skillVisibleToUser(row, visibilityUser));
  return { user: visibilityUser, skills };
}

export type SkillWithAccess = {
  skill: Skill;
  accessible: boolean;
};

/** All org skills with per-user access flag (marketplace: show locked rows). */
export async function findOrgSkillsWithAccessForUser(
  prisma: PrismaClient,
  authUserId: string,
): Promise<{ user: SkillVisibilityUser; skills: SkillWithAccess[] } | null> {
  const user = await prisma.user.findUnique({
    where: { userId: authUserId },
    select: {
      userId: true,
      orgId: true,
      role: true,
      department: { select: { name: true } },
    },
  });
  if (!user) {
    return null;
  }

  const rows = await prisma.skill.findMany({
    where: { orgId: DEFAULT_ORG_ID },
    orderBy: { createdAt: "desc" },
  });

  const visibilityUser: SkillVisibilityUser = {
    userId: user.userId,
    orgId: user.orgId,
    role: user.role,
    department: user.department.name,
  };

  const skills: SkillWithAccess[] = rows.map((skill) => ({
    skill,
    accessible: skillVisibleToUser(skill, visibilityUser),
  }));

  return { user: visibilityUser, skills };
}
