const ROLE_LABEL: Record<string, string> = {
  member: "Member",
  admin: "Admin",
};

/** Human-readable summary of skill allow lists for UI. */
export function accessSummaryForSkill(allowRole: string[], allowDepartment: string[]): string {
  if (allowRole.length === 0 && allowDepartment.length === 0) {
    return "Available to everyone in your organization.";
  }
  const parts: string[] = [];
  if (allowRole.length > 0) {
    const labels = allowRole.map((s) => ROLE_LABEL[s] ?? s);
    parts.push(`Roles: ${labels.join(", ")}`);
  }
  if (allowDepartment.length > 0) {
    parts.push(`Departments: ${allowDepartment.join(", ")}`);
  }
  return parts.join(" · ");
}
