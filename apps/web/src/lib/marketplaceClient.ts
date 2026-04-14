import { resolveApiUrl } from "@/apiBase";

export type MarketplaceSkillSummaryDto = {
  skill_id: string;
  name: string | null;
  description: string | null;
  nodes: string[];
  org_id: string | null;
  created_at: string;
  installed: boolean;
  accessible: boolean;
  access_summary: string;
  detail_hidden: boolean;
};

export type MarketplaceSkillsListResponse = {
  skills: MarketplaceSkillSummaryDto[];
  page: number;
  limit: number;
  total: number;
};

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

export async function listMarketplaceSkills(
  accessToken: string,
  params: { page?: number; limit?: number; installed_only?: boolean } = {},
): Promise<MarketplaceSkillsListResponse> {
  const qs = new URLSearchParams();
  if (params.page != null) {
    qs.set("page", String(params.page));
  }
  if (params.limit != null) {
    qs.set("limit", String(params.limit));
  }
  if (params.installed_only) {
    qs.set("installed_only", "true");
  }
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  const response = await fetch(resolveApiUrl(`/api/marketplace/skills${suffix}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<MarketplaceSkillsListResponse>;
}

export async function installSkill(accessToken: string, skillId: string): Promise<void> {
  const response = await fetch(resolveApiUrl("/api/skills/install"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ skill_id: skillId }),
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}

export async function uninstallSkill(accessToken: string, skillId: string): Promise<void> {
  const response = await fetch(
    resolveApiUrl(`/api/skills/install/${encodeURIComponent(skillId)}`),
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
}
