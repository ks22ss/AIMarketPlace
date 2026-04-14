import { resolveApiUrl } from "@/apiBase";

export type SkillSummaryDto = {
  skill_id: string;
  name: string;
  description: string | null;
  nodes: string[];
  org_id: string | null;
  created_at: string;
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

export async function listSkills(accessToken: string): Promise<SkillsListResponse> {
  const response = await fetch(resolveApiUrl("/api/skills"), {
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
