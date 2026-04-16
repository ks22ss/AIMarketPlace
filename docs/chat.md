# Chat happy path (end-to-end)

This doc walks through the **chat happy path** from the web UI to the API and back, using an alternating:

- description
- code snippet

format.

---

## 1) Web client sends `POST /api/chat` (SSE)

**Description**

The Chat page calls `postChatStream(accessToken, message, options, handlers, signal)`, which sends the same JSON body
as before but sets `Accept: text/event-stream` and reads the response body as **Server-Sent Events**. The body can
include `conversation_id` to append to an existing chat in `chat_conversations`; otherwise the server creates a new
conversation and returns its id + derived title. Token deltas are applied incrementally in the UI; `meta` carries
`trace_id`, `conversation` carries `{ conversation_id, title }` once persistence completes, `done` carries the final
`reply` plus the same conversation fields. A client-side splitter separates `<think>...</think>` deltas so the UI
renders a collapsible reasoning block. `postChat` (JSON response) remains in `chatClient.ts` for scripts or other
consumers that prefer a single JSON payload.

**Code snippet** (`apps/web/src/lib/chatClient.ts`)

```ts
export async function postChatStream(
  accessToken: string,
  message: string,
  options: { skill_id?: string } | undefined,
  handlers: ChatStreamHandlers | undefined,
  signal: AbortSignal,
): Promise<ChatPostResponse> {
  const response = await fetch(resolveApiUrl("/api/chat"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message,
      ...(options?.skill_id ? { skill_id: options.skill_id } : {}),
    }),
    signal,
  });
  // … parse SSE blocks: event `meta` | `token` | `done` | `error`
}
```

---

## 2) API validates request + chat configuration

**Description**

The API route validates the request body (Zod schema) and returns `503` if the server-side chat model isn’t configured
(missing API keys / model config). If `conversation_id` is provided it is verified against `chat_conversations`
(404 when the conversation belongs to another user, to avoid leaking ids). If `Accept` includes `text/event-stream`,
successful responses use SSE (see `public-api.ts` for event payloads); otherwise the handler returns JSON
`{ reply, traceId, conversationId, conversationTitle }`. Either way, both the user and assistant messages are appended
to the conversation once the run finishes. For existing threads, the server appends the new pair with a single
Postgres `jsonb ||` update so concurrent requests from multiple tabs concatenate instead of overwriting the whole
`messages` array.

**Code snippet** (`apps/api/src/features/chat/chat.routes.ts`)

```ts
router.post("/", requireAuth, async (request, response, next) => {
  try {
    const parsed = chatPostBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }

    if (!deps.chatModel) {
      response.status(503).json({
        error: "Chat is not configured",
        detail:
          "Set CHAT_API_KEY or OPENAI_API_KEY (and CHAT_BASE_URL / OPENAI_BASE_URL for MiniMax) plus LLM_MODEL.",
      });
      return;
    }
```

---

## 3) API authenticates + loads user + checks department consistency

**Description**

`requireAuth` populates `request.authUser`. The handler then loads the user from the database and verifies the JWT’s
`departmentId` matches the database user’s `departmentId` (defense-in-depth against stale/forged department context).

**Code snippet** (`apps/api/src/features/chat/chat.routes.ts`)

```ts
const authUser = request.authUser;
if (!authUser) {
  response.status(401).json({ error: "Unauthorized" });
  return;
}

const user = await deps.prisma.user.findUnique({
  where: { userId: authUser.userId },
  select: {
    userId: true,
    orgId: true,
    departmentId: true,
    role: true,
    department: { select: { name: true } },
  },
});
if (!user) {
  response.status(401).json({ error: "User not found" });
  return;
}

if (user.departmentId !== authUser.departmentId) {
  response.status(401).json({ error: "Unauthorized" });
  return;
}
```

---

## 4) Optional: skill lookup + allow-lists + install enforcement

**Description**

If the request includes `skill_id`, the API:

- fetches the `Skill` in the user’s effective org scope,
- checks role/department allow-lists,
- verifies the skill is installed (`UserSkill` exists),
- extracts the ordered node names (`skillNodes`) for execution.

If `skill_id` is omitted, it runs “default chat” (no user nodes).

**Code snippet** (`apps/api/src/features/chat/chat.routes.ts`)

```ts
const org = effectiveOrgId(user);
let nodeNames: string[] = [];

if (parsed.data.skill_id) {
  const skill = await deps.prisma.skill.findFirst({
    where: { skillId: parsed.data.skill_id, orgId: org },
  });
  if (!skill) {
    response.status(404).json({ error: "Skill not found" });
    return;
  }

  if (
    !userMatchesAllowLists(
      { role: normalizeUserRoleSlug(user.role), department: user.department.name },
      skill.allowRole,
      skill.allowDepartment,
    )
  ) {
    response.status(403).json({ error: "Forbidden", detail: "You cannot run this skill." });
    return;
  }

  const installRow = await deps.prisma.userSkill.findUnique({
    where: { userId_skillId: { userId: user.userId, skillId: skill.skillId } },
  });
  if (!installRow) {
    response.status(403).json({ error: "Forbidden", detail: "Install this skill first." });
    return;
  }

  nodeNames = parseSkillNodes(skill.skillNodes);
}
```

---

## 5) Runtime compiles a LangGraph `StateGraph` per request

**Description**

The runtime derives the step order via `buildSkillExecutionOrder` (same logic as before), then
`compileSkillGraph` creates a `StateGraph` where each step becomes a graph node wired with linear
`START → step[0] → … → END` edges. `runSkill` calls `compiled.invoke()` to execute.

**Code snippet** (`apps/api/src/lib/agent/runtime.ts`)

```ts
function compileSkillGraph(deps: RunSkillDeps, skillNodeNames: string[]) {
  const order = buildSkillExecutionOrder(deps.pipeline, skillNodeNames);
  const graph = new StateGraph(SkillGraphState);

  const lastStepName = order[order.length - 1];
  for (const stepName of order) {
    if (stepName === SYSTEM_RETRIEVE) {
      graph.addNode(stepName, retrieveDocumentsNode(deps));
    } else {
      const isFinalPromptStep = stepName === lastStepName;
      graph.addNode(stepName, promptNodeFactory(deps, stepName, isFinalPromptStep));
    }
  }

  graph.addEdge(START, order[0]);
  for (let i = 0; i < order.length - 1; i++) {
    graph.addEdge(order[i], order[i + 1]);
  }
  graph.addEdge(order[order.length - 1], END);

  return graph.compile();
}

export async function runSkill(deps, skillNodeNames, initial): Promise<AgentState> {
  const compiled = compileSkillGraph(deps, skillNodeNames);
  return await compiled.invoke({ query: initial.query, userId: initial.userId, ... });
}
```

---

## 6) Optional: `retrieve_documents` populates context via embeddings + Weaviate

**Description**

When retrieval runs, it calls `pipeline.queryContext({ departmentId, query, limit })`. The pipeline:

- embeds the query,
- runs Weaviate nearest-neighbor search filtered by `department_id`,
- returns the top chunks, which are concatenated into `state.context`.

**Code snippet** (`apps/api/src/features/docs/document.pipeline.ts`)

```ts
async function queryContext(input: { departmentId: string; query: string; limit: number }) {
  const vectors = await deps.embeddings.embedTexts([input.query]);
  const vector = vectors[0];
  if (!vector) {
    throw new Error("Failed to embed query");
  }

  const matches = await deps.weaviate.queryNearest({
    vector,
    departmentId: input.departmentId,
    limit: input.limit,
  });

  return matches.map((match) => ({
    text: match.text,
    doc_id: match.doc_id,
    chunk_index: match.chunk_index,
    score: match.distance,
  }));
}
```

**Code snippet** (`apps/api/src/features/docs/weaviate.store.ts`)

```ts
async function queryNearest(params: { vector: number[]; departmentId: string; limit: number }) {
  const safeDepartmentId = assertFilterUuid(params.departmentId);
  const safeLimit = clampGetLimit(params.limit);

  const query = `
    query ($vector: [Float]!) {
      Get {
        DocumentChunk(
          nearVector: { vector: $vector }
          where: {
            path: ["department_id"]
            operator: Equal
            valueText: "${safeDepartmentId}"
          }
          limit: ${safeLimit}
        ) {
          text
          doc_id
          chunk_index
          _additional { distance }
        }
      }
    }
  `;
  // ...
}
```

---

## 7) Prompt graph nodes call the LLM and produce the final reply

**Description**

Each prompt graph node is created by `promptNodeFactory(deps, nodeName, isFinalPromptStep)`. The factory returns a closure that:
- loads the prompt template from DB (or uses the built-in default for `__default_agent_reply__`),
- injects `{{query}}`, `{{context}}`, `{{output}}` variables,
- calls LangChain `ChatOpenAI.invoke(...)` with a 120s timeout for non-final steps (and for all steps when `onFinalLlmToken` is unset),
- on the **last** prompt step when `RunSkillDeps.onFinalLlmToken` is set (SSE chat), uses `ChatOpenAI.stream(...)` instead and forwards text deltas to the callback,
- returns `{ output, intermediate }` to update the graph state.

The HTTP response returns **only** the final LLM reply (`output`) plus a generated `traceId` and the persisted `conversationId` / `conversationTitle` (JSON mode), or streams token events then `conversation` + `done` (SSE). It does **not** return raw retrieved chunks (`context`) to the client.

**Code snippet** (`apps/api/src/lib/agent/runtime.ts`)

```ts
function promptNodeFactory(deps: RunSkillDeps, nodeName: string) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    let promptTemplate: string;
    if (nodeName === DEFAULT_COMPLETION_NODE) {
      promptTemplate = DEFAULT_AGENT_PROMPT_TEMPLATE;
    } else {
      const node = await deps.prisma.node.findFirst({
        where: { orgId: deps.orgId, name: nodeName },
      });
      if (!node) throw new Error("Unknown node: " + nodeName);
      promptTemplate = node.promptTemplate;
    }

    let userMessage = injectVariables(promptTemplate, state);
    // ... context / no-excerpts append logic (unchanged) ...

    const response = await callLlm(deps.chatModel, userMessage);
    return { output: response, intermediate: { ...prev, [nodeName]: response } };
  };
}
```
