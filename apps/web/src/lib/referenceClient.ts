import { resolveApiUrl } from "@/apiBase";

export type DepartmentOption = { id: string; name: string };
export type RoleOption = { id: string; slug: string; label: string | null };

export async function listDepartments(): Promise<DepartmentOption[]> {
  const response = await fetch(resolveApiUrl("/api/reference/departments"));
  if (!response.ok) {
    throw new Error("Failed to load departments");
  }
  const data = (await response.json()) as { departments: DepartmentOption[] };
  return data.departments;
}

export async function listRoles(): Promise<RoleOption[]> {
  const response = await fetch(resolveApiUrl("/api/reference/roles"));
  if (!response.ok) {
    throw new Error("Failed to load roles");
  }
  const data = (await response.json()) as { roles: RoleOption[] };
  return data.roles;
}
