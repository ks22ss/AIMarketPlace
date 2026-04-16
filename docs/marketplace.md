# Marketplace path (browse → access → install)

This doc walks the **marketplace** flow: listing org skills with per-user access flags, redacting locked skills, and installing or uninstalling via `UserSkill`. It uses the same alternating pattern as `docs/chat.md`:

- description
- code snippet

---

## 1) Web: load the marketplace grid

**Description**

The Marketplace page requests a paginated list with `listMarketplaceSkills(accessToken, { page, limit })`. It also loads “installed only” in parallel (`installed_only: true`, higher limit) to populate “Your installed skills”. Install/uninstall handlers refresh both lists.

**Code snippet** (`apps/web/src/pages/MarketplacePage.tsx`)

```ts
const result = await listMarketplaceSkills(accessToken, { page, limit: PAGE_LIMIT });
setSkills(result.skills);
setTotal(result.total);

// Installed sidebar
const installed = await listMarketplaceSkills(accessToken, {
  page: 1,
  limit: 100,
  installed_only: true,
});
setInstalledSkills(installed.skills);
```

---

## 2) Web client: `GET /api/marketplace/skills`

**Description**

The client sends the JWT as `Authorization: Bearer`. Query params: `page`, `limit`, and optional `installed_only=true` to restrict rows to skills the user has installed **and** can access.

**Code snippet** (`apps/web/src/lib/marketplaceClient.ts`)

```ts
export async function listMarketplaceSkills(
  accessToken: string,
  params: { page?: number; limit?: number; installed_only?: boolean } = {},
): Promise<MarketplaceSkillsListResponse> {
  const qs = new URLSearchParams();
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.installed_only) qs.set("installed_only", "true");
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  const response = await fetch(resolveApiUrl(`/api/marketplace/skills${suffix}`), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json() as Promise<MarketplaceSkillsListResponse>;
}
```

---

## 3) API: marketplace router

**Description**

`GET /api/marketplace/skills` is mounted at `/api/marketplace` (`apps/api/src/index.ts`). The handler loads all default-org skills with an **`accessible`** flag per user, optional `installed_only` filter, then paginates in memory and maps each row to a DTO (full detail when accessible, redacted when not).

**Code snippet** (`apps/api/src/features/marketplace/marketplace.routes.ts`)

```ts
const result = await findOrgSkillsWithAccessForUser(prisma, auth.userId);

const installedRows = await prisma.userSkill.findMany({
  where: { userId: auth.userId },
  select: { skillId: true },
});
const installedSet = new Set(installedRows.map((r) => r.skillId));

let candidates = result.skills;
if (installedOnly) {
  candidates = candidates.filter(
    (row) => row.accessible && installedSet.has(row.skill.skillId),
  );
}

const pageRows = candidates.slice(skip, skip + limit);
// ... map to MarketplaceSkillSummaryDto (accessible vs detail_hidden) ...
```

---

## 4) Access model: org + allow lists

**Description**

`findOrgSkillsWithAccessForUser` loads skills where `orgId === DEFAULT_ORG_ID`, then sets `accessible = skillVisibleToUser(skill, visibilityUser)`. Visibility requires the skill’s org to match **`effectiveOrgId(user)`** (`user.orgId ?? user.userId`) and the user’s **role** and **department name** to pass **`userMatchesAllowLists`** against the skill’s `allowRole` and `allowDepartment` arrays.

**Code snippet** (`apps/api/src/features/skills/skill-queries.ts`)

```ts
export function skillVisibleToUser(skill: Skill, user: SkillVisibilityUser): boolean {
  const org = effectiveOrgId(user);
  if (skill.orgId !== org) {
    return false;
  }
  const accessUser: AccessUser = { role: normalizeUserRoleSlug(user.role), department: user.department };
  return userMatchesAllowLists(accessUser, skill.allowRole, skill.allowDepartment);
}
```

**Code snippet** (`apps/api/src/features/nodes/access.ts`)

```ts
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
```

---

## 5) Locked skills: what the client sees

**Description**

When `accessible` is false, the marketplace response still includes `skill_id`, `org_id`, `created_at`, install flags, and `access_summary`, but clears **`name` / `description` / `nodes`** and sets **`detail_hidden: true`** so the UI can show a locked card without exposing skill content.

**Code snippet** (`apps/api/src/features/marketplace/marketplace.routes.ts`)

```ts
if (accessible) {
  return {
    skill_id: s.skillId,
    name: s.name,
    description: s.description,
    nodes: parseStoredSkillNodes(s.skillNodes),
    // ...
    accessible: true,
    detail_hidden: false,
  };
}
return {
  skill_id: s.skillId,
  name: null,
  description: null,
  nodes: [],
  // ...
  accessible: false,
  detail_hidden: true,
};
```

---

## 6) Web: install a skill

**Description**

Install is **not** a marketplace route: the client calls **`POST /api/skills/install`** with `{ skill_id }`. The Marketplace page invokes `installSkill` then refreshes the main list and the installed-only list.

**Code snippet** (`apps/web/src/pages/MarketplacePage.tsx`)

```ts
await installSkill(accessToken, skillId);
await refresh();
await refreshInstalled();
```

**Code snippet** (`apps/web/src/lib/marketplaceClient.ts`)

```ts
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
```

---

## 7) API: install enforces the same visibility rule

**Description**

The install handler loads the skill, then **`skillVisibleToUser`** again. If the user cannot see the skill, install returns **403**. On success it creates a **`UserSkill`** row (composite unique on `userId` + `skillId`). Duplicate install is treated as idempotent (**200** with `installed: true`).

**Code snippet** (`apps/api/src/features/skills/skills.routes.ts`)

```ts
const skill = await prisma.skill.findUnique({
  where: { skillId: parsed.data.skill_id },
});
if (!skill) {
  response.status(404).json({ error: "Skill not found" });
  return;
}

if (!skillVisibleToUser(skill, visibilityUser)) {
  response.status(403).json({ error: "Forbidden", detail: "You cannot install this skill." });
  return;
}

await prisma.userSkill.create({
  data: {
    userId: auth.userId,
    skillId: skill.skillId,
  },
});
```

---

## 8) Web: uninstall a skill

**Description**

Uninstall calls **`DELETE /api/skills/install/:skillId`**, which removes the current user’s `UserSkill` row. The UI confirms before calling.

**Code snippet** (`apps/web/src/lib/marketplaceClient.ts`)

```ts
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
```

---

## 9) After install: Chat

**Description**

Running a skill in chat requires the skill to be **installed** (`UserSkill`) and the user to pass the skill’s **allow lists** again at request time (`POST /api/chat` with `skill_id`). Deep links from the marketplace typically open Chat with `/?skill_id=...` (see web routing). This doc stops at install; the full chat path is in `docs/chat.md`.
