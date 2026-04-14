export type AccessUser = {
  role: string;
  department: string | null;
};

export function userMatchesAllowLists(
  user: AccessUser,
  allowRole: string[],
  allowDepartment: string[],
): boolean {
  if (allowRole.length > 0 && !allowRole.includes(user.role)) {
    return false;
  }
  if (allowDepartment.length > 0) {
    if (!user.department || !allowDepartment.includes(user.department)) {
      return false;
    }
  }
  return true;
}

export function effectiveOrgId(user: { orgId: string | null; userId: string }): string {
  return user.orgId ?? user.userId;
}
