import { resolveApiUrl } from "@/apiBase";

export type SkillSummaryDto = {
  skill_id: string;
  name: string;
  description: string | null;
  nodes: string[];
  org_id: string | null;
  created_at: string;
  access_summary: string;
  allow_role: string[];
  allow_department: string[];
};

export type SkillsListResponse = { skills: SkillSummaryDto[] };

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string; detail?: string };
    const parts = [parsed.error, parsed.detail].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" — ");
    }
  } catch {
    // ignore
  }
  return text || `HTTP ${response.status}`;
}

export async function listSkills(
  accessToken: string,
  params: { installed_only?: boolean } = {},
): Promise<SkillsListResponse> {
  const qs = new URLSearchParams();
  if (params.installed_only) {
    qs.set("installed_only", "true");
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  const response = await fetch(resolveApiUrl(`/api/skills${suffix}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<SkillsListResponse>;
}

export async function createSkill(
  accessToken: string,
  body: {
    name: string;
    description?: string | null;
    nodes: string[];
    allow_department_ids?: string[];
    allow_role_slugs?: ("member" | "admin")[];
  },
): Promise<{ skill_id: string; name: string; version: number; nodes: string[] }> {
  const response = await fetch(resolveApiUrl("/api/skills"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<{
    skill_id: string;
    name: string;
    version: number;
    nodes: string[];
  }>;
}
async function readErrorMessageWithDetails(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as {
      error?: string;
      detail?: string;
      blocking_skills?: { skill_id: string; name: string }[];
    };
    const parts = [parsed.error, parsed.detail].filter(Boolean);
    let msg = parts.length > 0 ? parts.join(" — ") : text || `HTTP ${response.status}`;
    if (parsed.blocking_skills && parsed.blocking_skills.length > 0) {
      const names = parsed.blocking_skills.map((b) => b.name).join(", ");
      msg = `${msg} Blocking skills: ${names}.`;
    }
    return msg;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

export async function updateSkill(
  accessToken: string,
  skillId: string,
  body: {
    name?: string;
    description?: string | null;
    nodes?: string[];
    allow_department_ids?: string[];
    allow_role_slugs?: ("member" | "admin")[];
  },
): Promise<{ skill_id: string; name: string; version: number; nodes: string[] }> {
  const response = await fetch(resolveApiUrl(`/api/skills/${encodeURIComponent(skillId)}`), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessageWithDetails(response));
  }
  return response.json() as Promise<{
    skill_id: string;
    name: string;
    version: number;
    nodes: string[];
  }>;
}

export async function deleteSkill(accessToken: string, skillId: string): Promise<void> {
  const response = await fetch(resolveApiUrl(`/api/skills/${encodeURIComponent(skillId)}`), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessageWithDetails(response));
  }
}
