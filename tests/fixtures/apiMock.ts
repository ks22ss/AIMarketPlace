import type { Page, Route, Request } from "@playwright/test";

export type MockUser = {
  userId: string;
  email: string;
  orgId?: string | null;
  role: string;
  department: { name: string };
};

export type MarketplaceSkill = {
  skill_id: string;
  name: string | null;
  description: string | null;
  version: number;
  installed: boolean;
  nodes: string[];
  org_id: string | null;
  created_at: string;
  accessible: boolean;
  access_summary: string;
  detail_hidden: boolean;
  allow_role?: string[] | null;
  allow_department?: string[] | null;
};

export type MockState = {
  accessToken: string;
  user: MockUser;
  roles: { slug: string; name: string }[];
  departments: { department_id: string; name: string }[];
  marketplace: {
    page: number;
    limit: number;
    total: number;
    skills: MarketplaceSkill[];
  };
  installedSkills: MarketplaceSkill[];
  skills: { skill_id: string; name: string; nodes: string[] }[];
  nodes: { node_id: string; name: string; prompt_template: string }[];
  documents: { document_id: string; file_name: string; status: string; created_at: string }[];
};

function json(route: Route, status: number, body: unknown) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function unauthorized(route: Route) {
  return json(route, 401, { error: "Unauthorized" });
}

function matchApiPath(request: Request): URL | null {
  try {
    return new URL(request.url());
  } catch {
    return null;
  }
}

function hasBearer(request: Request, expectedToken: string): boolean {
  const header = request.headers()["authorization"];
  return typeof header === "string" && header.trim() === `Bearer ${expectedToken}`;
}

export function createDefaultMockState(): MockState {
  const now = new Date().toISOString();
  const installedSkill: MarketplaceSkill = {
    skill_id: "skill_installed_1",
    name: "Summarize docs",
    description: "Summarize a question using your indexed documents.",
    version: 1,
    installed: true,
    nodes: ["summarize"],
    org_id: "org_1",
    created_at: now,
    accessible: true,
    access_summary: "Accessible to you",
    detail_hidden: false,
  };
  const catalogSkill: MarketplaceSkill = {
    skill_id: "skill_catalog_1",
    name: "Meeting notes",
    description: "Turn raw notes into action items.",
    version: 1,
    installed: false,
    nodes: ["summarize"],
    org_id: "org_1",
    created_at: now,
    accessible: true,
    access_summary: "Accessible to you",
    detail_hidden: false,
  };

  return {
    accessToken: "e2e-token",
    user: {
      userId: "user_1",
      email: "e2e@example.com",
      orgId: "org_1",
      role: "member",
      department: { name: "Engineering" },
    },
    roles: [
      { slug: "member", name: "Member" },
      { slug: "admin", name: "Admin" },
    ],
    departments: [{ department_id: "dept_eng", name: "Engineering" }],
    marketplace: {
      page: 1,
      limit: 16,
      total: 2,
      skills: [installedSkill, catalogSkill],
    },
    installedSkills: [installedSkill],
    skills: [
      { skill_id: installedSkill.skill_id, name: installedSkill.name ?? "Skill", nodes: ["summarize"] },
    ],
    nodes: [
      { node_id: "node_1", name: "summarize", prompt_template: "Summarize: {{query}}" },
    ],
    documents: [
      { document_id: "doc_1", file_name: "handbook.pdf", status: "ready", created_at: now },
    ],
  };
}

async function handleApiRoute(route: Route, request: Request, state: MockState): Promise<void> {
  const url = matchApiPath(request);
  if (!url) {
    await route.continue();
    return;
  }

  const method = request.method().toUpperCase();
  const path = url.pathname;

  // Health
  if (method === "GET" && path === "/health") {
    await json(route, 200, { status: "ok", service: "aimarketplace-api", timestamp: new Date().toISOString() });
    return;
  }

  // Auth
  if (method === "POST" && path === "/api/auth/login") {
    await json(route, 200, { accessToken: state.accessToken });
    return;
  }
  if (method === "POST" && path === "/api/auth/register") {
    await json(route, 200, { accessToken: state.accessToken });
    return;
  }
  if (method === "GET" && path === "/api/auth/me") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    await json(route, 200, { user: state.user });
    return;
  }

  // Reference
  if (method === "GET" && path === "/api/reference/departments") {
    await json(route, 200, { departments: state.departments });
    return;
  }
  if (method === "GET" && path === "/api/reference/roles") {
    await json(route, 200, { roles: state.roles });
    return;
  }

  // Marketplace list
  if (method === "GET" && path === "/api/marketplace/skills") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const installedOnly = url.searchParams.get("installed_only");
    if (installedOnly === "true") {
      await json(route, 200, {
        skills: state.installedSkills,
        page: 1,
        limit: 16,
        total: state.installedSkills.length,
      });
      return;
    }
    await json(route, 200, state.marketplace);
    return;
  }

  // Install/uninstall
  if (path === "/api/skills/install" && method === "POST") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const body = (() => {
      const raw = request.postData();
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { skill_id?: string };
      } catch {
        return null;
      }
    })();
    if (!body?.skill_id) {
      await json(route, 400, { error: "Invalid request body" });
      return;
    }
    // Toggle installed flag in catalog.
    state.marketplace.skills = state.marketplace.skills.map((s) =>
      s.skill_id === body.skill_id ? { ...s, installed: true } : s,
    );
    const installed = state.marketplace.skills.find((s) => s.skill_id === body.skill_id);
    if (installed && !state.installedSkills.some((s) => s.skill_id === installed.skill_id)) {
      state.installedSkills = [...state.installedSkills, { ...installed, installed: true }];
      state.skills = [
        ...state.skills,
        { skill_id: installed.skill_id, name: installed.name ?? "Skill", nodes: ["summarize"] },
      ];
    }
    await json(route, 200, { installed: true });
    return;
  }

  if (path.startsWith("/api/skills/install/") && method === "DELETE") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const skillId = decodeURIComponent(path.split("/").pop() ?? "");
    state.marketplace.skills = state.marketplace.skills.map((s) =>
      s.skill_id === skillId ? { ...s, installed: false } : s,
    );
    state.installedSkills = state.installedSkills.filter((s) => s.skill_id !== skillId);
    state.skills = state.skills.filter((s) => s.skill_id !== skillId);
    await json(route, 200, { uninstalled: true });
    return;
  }

  // Skills + nodes
  if (path === "/api/skills" && method === "GET") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const installedOnly = url.searchParams.get("installed_only");
    if (installedOnly === "true") {
      await json(route, 200, { skills: state.skills });
      return;
    }
    await json(route, 200, { skills: state.skills });
    return;
  }
  if (path === "/api/skills" && method === "POST") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const body = (() => {
      const raw = request.postData();
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { name?: string; nodes?: string[] };
      } catch {
        return null;
      }
    })();
    if (!body?.name || !Array.isArray(body.nodes) || body.nodes.length === 0) {
      await json(route, 400, { error: "Invalid request body" });
      return;
    }
    const created = { skill_id: `skill_${Date.now()}`, name: body.name, nodes: body.nodes, version: 1 };
    state.skills = [...state.skills, created];
    await json(route, 200, created);
    return;
  }
  if (path === "/api/nodes" && method === "GET") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    await json(route, 200, { nodes: state.nodes });
    return;
  }
  if (path === "/api/nodes" && method === "POST") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const body = (() => {
      const raw = request.postData();
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { name?: string; prompt_template?: string };
      } catch {
        return null;
      }
    })();
    if (!body?.name || !body.prompt_template) {
      await json(route, 400, { error: "Invalid request body" });
      return;
    }
    const created = { node_id: `node_${Date.now()}`, name: body.name, prompt_template: body.prompt_template };
    state.nodes = [...state.nodes, created];
    await json(route, 200, created);
    return;
  }

  // Chat
  if (path === "/api/chat" && method === "POST") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const body = (() => {
      const raw = request.postData();
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { message?: string; skill_id?: string };
      } catch {
        return null;
      }
    })();
    if (!body?.message) {
      await json(route, 400, { error: "Invalid request body" });
      return;
    }
    if (body.skill_id && !state.installedSkills.some((s) => s.skill_id === body.skill_id)) {
      await json(route, 403, { error: "Forbidden", detail: "Install this skill from the Marketplace." });
      return;
    }
    await json(route, 200, { reply: `Echo: ${body.message}`, traceId: "trace_mock_1" });
    return;
  }

  // Docs (presign + ingest + list + delete)
  if (path === "/api/docs/presign" && method === "POST") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const body = (() => {
      const raw = request.postData();
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { fileName?: string; contentType?: string };
      } catch {
        return null;
      }
    })();
    if (!body?.fileName || !body.contentType) {
      await json(route, 400, { error: "Invalid request body" });
      return;
    }
    const documentId = `doc_${Date.now()}`;
    const uploadUrl = `https://example.invalid/upload/${encodeURIComponent(documentId)}`;
    await json(route, 200, {
      uploadUrl,
      documentId,
      objectKey: `documents/${documentId}/${body.fileName}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    return;
  }

  if (path === "/api/docs/ingest" && method === "POST") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const body = (() => {
      const raw = request.postData();
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { documentId?: string };
      } catch {
        return null;
      }
    })();
    if (!body?.documentId) {
      await json(route, 400, { error: "Invalid request body" });
      return;
    }
    state.documents = [
      { document_id: body.documentId, file_name: "uploaded.txt", status: "ready", created_at: new Date().toISOString() },
      ...state.documents,
    ];
    await json(route, 200, { documentId: body.documentId, status: "ready", chunkCount: 3 });
    return;
  }

  if (path === "/api/docs" && method === "GET") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    await json(route, 200, { documents: state.documents });
    return;
  }

  if (path.startsWith("/api/docs/") && method === "DELETE") {
    if (!hasBearer(request, state.accessToken)) {
      await unauthorized(route);
      return;
    }
    const documentId = decodeURIComponent(path.split("/").pop() ?? "");
    state.documents = state.documents.filter((d) => d.document_id !== documentId);
    await json(route, 200, { deleted: true, document_id: documentId, storage_cleanup: { ok: true } });
    return;
  }

  // Allow presigned upload to succeed.
  if (method === "PUT" && url.hostname === "example.invalid" && url.pathname.startsWith("/upload/")) {
    await route.fulfill({ status: 200, body: "" });
    return;
  }

  await json(route, 404, { error: `No mock for ${method} ${path}` });
}

export async function installApiMock(page: Page, state: MockState): Promise<void> {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = matchApiPath(request);
    if (!url) {
      await route.continue();
      return;
    }

    if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
      await handleApiRoute(route, request, state);
      return;
    }

    // Also allow our fake presigned URL host.
    if (request.method().toUpperCase() === "PUT" && url.hostname === "example.invalid") {
      await handleApiRoute(route, request, state);
      return;
    }

    await route.continue();
  });
}

