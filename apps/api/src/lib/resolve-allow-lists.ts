import type { PrismaClient } from "@prisma/client";

export type AllowListInput = {
  allow_department_ids?: string[] | undefined;
  allow_role_slugs?: string[] | undefined;
  allow_department?: string[] | undefined;
  allow_role?: string[] | undefined;
};

export type ResolvedAllowLists =
  | { ok: true; allowRole: string[]; allowDepartment: string[] }
  | { ok: false; error: string };

/**
 * Resolves skill/node allow lists from either reference IDs/slugs (preferred) or legacy
 * string arrays validated against `departments` / `roles`.
 */
export async function resolveAllowLists(prisma: PrismaClient, body: AllowListInput): Promise<ResolvedAllowLists> {
  const legacyDept = body.allow_department?.filter((s) => s.length > 0) ?? [];
  const legacyRole = body.allow_role?.filter((s) => s.length > 0) ?? [];
  const newDeptIds = body.allow_department_ids?.filter((s) => s.length > 0) ?? [];
  const newRoleSlugs = body.allow_role_slugs?.filter((s) => s.length > 0) ?? [];

  const hasLegacy = legacyDept.length > 0 || legacyRole.length > 0;
  const hasNew = newDeptIds.length > 0 || newRoleSlugs.length > 0;

  if (hasLegacy && hasNew) {
    return {
      ok: false,
      error:
        "Use either allow_department_ids/allow_role_slugs or legacy allow_department/allow_role, not both.",
    };
  }

  if (hasNew) {
    let allowDepartment: string[] = [];
    if (newDeptIds.length > 0) {
      const found = await prisma.department.findMany({
        where: { departmentId: { in: newDeptIds } },
        select: { departmentId: true, name: true },
      });
      if (found.length !== newDeptIds.length) {
        return { ok: false, error: "Invalid allow_department_ids" };
      }
      allowDepartment = found.map((d) => d.name);
    }

    let allowRole: string[] = [];
    if (newRoleSlugs.length > 0) {
      const found = await prisma.role.findMany({
        where: { slug: { in: newRoleSlugs } },
        select: { slug: true },
      });
      if (found.length !== newRoleSlugs.length) {
        return { ok: false, error: "Invalid allow_role_slugs" };
      }
      allowRole = found.map((r) => r.slug);
    }

    return { ok: true, allowRole, allowDepartment };
  }

  if (hasLegacy) {
    if (legacyDept.length > 0) {
      const found = await prisma.department.findMany({
        where: { name: { in: legacyDept } },
        select: { name: true },
      });
      if (found.length !== legacyDept.length) {
        return { ok: false, error: "Unknown department name in allow_department" };
      }
    }
    if (legacyRole.length > 0) {
      const found = await prisma.role.findMany({
        where: { slug: { in: legacyRole } },
        select: { slug: true },
      });
      if (found.length !== legacyRole.length) {
        return { ok: false, error: "Unknown role slug in allow_role" };
      }
    }
    return { ok: true, allowRole: legacyRole, allowDepartment: legacyDept };
  }

  return { ok: true, allowRole: [], allowDepartment: [] };
}
