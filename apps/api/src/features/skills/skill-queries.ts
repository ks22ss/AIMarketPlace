import type { PrismaClient, Skill } from "@prisma/client";
import { z } from "zod";

import { effectiveOrgId, userMatchesAllowLists, type AccessUser } from "../nodes/access.js";

const SKILL_NODES_MAX = 10;

export function parseStoredSkillNodes(value: unknown): string[] {
  const parsed = z.array(z.string().min(1).max(200)).max(SKILL_NODES_MAX).safeParse(value);
  return parsed.success ? parsed.data : [];
}

export type SkillVisibilityUser = {
  userId: string;
  orgId: string | null;
  role: string;
  department: string | null;
};

export function skillVisibleToUser(skill: Skill, user: SkillVisibilityUser): boolean {
  const org = effectiveOrgId(user);
  const orgScopeOk =
    skill.orgId === org ||
    (skill.orgId === null && skill.createdBy !== null && skill.createdBy === user.userId);
  if (!orgScopeOk) {
    return false;
  }
  const accessUser: AccessUser = { role: user.role, department: user.department };
  return userMatchesAllowLists(accessUser, skill.allowRole, skill.allowDepartment);
}

/** Skills the user may see (org + personal drafts), filtered by role/department allow lists. */
export async function findVisibleSkillsForUser(
  prisma: PrismaClient,
  authUserId: string,
): Promise<{ user: SkillVisibilityUser; skills: Skill[] } | null> {
  const user = await prisma.user.findUnique({
    where: { userId: authUserId },
    select: { userId: true, orgId: true, role: true, department: true },
  });
  if (!user) {
    return null;
  }

  const org = effectiveOrgId(user);
  const rows = await prisma.skill.findMany({
    where: {
      OR: [{ orgId: org }, { orgId: null, createdBy: user.userId }],
    },
    orderBy: { createdAt: "desc" },
  });

  const visibilityUser: SkillVisibilityUser = {
    userId: user.userId,
    orgId: user.orgId,
    role: user.role,
    department: user.department,
  };

  const skills = rows.filter((row) => skillVisibleToUser(row, visibilityUser));
  return { user: visibilityUser, skills };
}
