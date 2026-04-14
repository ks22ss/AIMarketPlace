import { resolveApiUrl } from "@/apiBase";

export type NodeDto = {
  node_id: string;
  name: string;
  description: string | null;
  prompt_template: string;
  created_by: string;
  org_id: string;
  allow_role: string[];
  allow_department: string[];
  created_at: string;
};

export type NodesListResponse = { nodes: NodeDto[] };

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

export async function listNodes(accessToken: string): Promise<NodesListResponse> {
  const response = await fetch(resolveApiUrl("/api/nodes"), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<NodesListResponse>;
}

export async function createNode(
  accessToken: string,
  body: { name: string; description?: string | null; prompt_template: string },
): Promise<{ node_id: string; name: string }> {
  const response = await fetch(resolveApiUrl("/api/nodes"), {
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
  return response.json() as Promise<{ node_id: string; name: string }>;
}
