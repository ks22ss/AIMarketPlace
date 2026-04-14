# Primary Flows

## Flow 1 — Sign in and get an access token

1. User submits email/password in the UI; the API expects a JSON body for login.
   → apps/api/src/features/auth/auth.controller.ts:36–56

2. Auth service looks up the user row (including password hash) by normalized email.
   → apps/api/src/features/auth/auth.service.ts:70–79

3. Service verifies the password hash and, on success, signs a JWT access token.
   → apps/api/src/features/auth/auth.service.ts:80–100

4. Client stores token and uses it as `Authorization: Bearer <token>` on all protected routes.
   → apps/api/src/features/auth/auth.middleware.ts:10–28

## Flow 2 — Marketplace install → Chat runs a skill workflow

1. UI lists marketplace skills (paged) and separately loads “installed” skills.
   → apps/web/src/pages/MarketplacePage.tsx:71–112

2. API returns skill catalog rows with (a) access-limited detail masking and (b) installed flags.
   → apps/api/src/features/marketplace/marketplace.routes.ts:23–105

3. User clicks “Install”; UI calls the install endpoint then refreshes catalog + installed list.
   → apps/web/src/pages/MarketplacePage.tsx:130–146

4. API validates the skill is visible to the user, then creates `userSkill` (idempotent on unique conflict).
   → apps/api/src/features/skills/skills.routes.ts:187–257

5. In Chat UI, only installed skills are listed; the chosen `skill_id` is sent to `POST /api/chat`.
   → apps/web/src/pages/ChatPage.tsx:51–76
   → apps/web/src/pages/ChatPage.tsx:118–158

6. API resolves the skill, checks allow-lists, verifies it’s installed, then runs nodes via `runSkill`.
   → apps/api/src/features/chat/chat.routes.ts:93–155

7. Runtime executes nodes in order; if the document pipeline is enabled, it forces one `retrieve_documents` step first.
   → apps/api/src/lib/agent/runtime.ts:25–67

8. Each prompt node injects `{{query}}/{{context}}/{{output}}`, calls the LLM, and stores the output in state.
   → apps/api/src/lib/agent/runtime.ts:43–126

## Flow 3 — Documents: presign → upload → ingest → retrieval

1. UI requests a presigned upload URL, then uploads the file, then calls ingest; it finally refreshes the documents list.
   → apps/web/src/pages/DocsRagPage.tsx:62–91

2. API `POST /api/docs/presign` creates a document row and returns the presigned PUT URL + object key.
   → apps/api/src/features/docs/docs.routes.ts:169–213

3. Ingest pulls the object from storage, extracts text, chunks it, embeds chunks, and indexes them into Weaviate.
   → apps/api/src/features/docs/docs.routes.ts:216–255
   → apps/api/src/features/docs/document.pipeline.ts:117–163

4. When a chat run includes retrieval, the runtime queries for nearest chunks and appends excerpts (or “none found”) to the prompt.
   → apps/api/src/lib/agent/runtime.ts:85–118

---

## Step 1 — Verify auth token (protected routes)

Protected routes require `Authorization: Bearer <token>`; the middleware verifies the JWT and sets `request.authUser`.

↳ Evidence:
- apps/api/src/features/auth/auth.middleware.ts:10–28

↳ Code:
```ts
const header = request.headers.authorization;
if (!header?.startsWith("Bearer ")) {
  response.status(401).json({ error: "Missing or invalid Authorization header" });
  return;
}
const payload = verifyAccessToken(token);
request.authUser = { userId: payload.sub, email: payload.email };
```

↳ Notes:
- Invalid/missing/expired tokens short-circuit with 401 before any handler logic runs.

## Step 2 — Install a skill for a user

Installing creates a `userSkill` row; if it already exists, the endpoint returns success anyway (idempotent UX).

↳ Evidence:
- apps/api/src/features/skills/skills.routes.ts:187–257

↳ Code:
```ts
await prisma.userSkill.create({
  data: { userId: auth.userId, skillId: skill.skillId },
});
response.status(201).json({ installed: true, skill_id: skill.skillId });
// ...unique constraint → return 200 with same payload...
```

↳ Notes:
- Visibility and access checks happen before the insert (skill must be visible to user).

## Step 3 — Enforce “installed before run” in chat

Chat refuses to run a skill unless the user has installed it from the marketplace.

↳ Evidence:
- apps/api/src/features/chat/chat.routes.ts:118–138

↳ Code:
```ts
const installRow = await deps.prisma.userSkill.findUnique({
  where: { userId_skillId: { userId: user.userId, skillId: skill.skillId } },
});
if (!installRow) {
  response.status(403).json({ error: "Forbidden", detail: "Install this skill..." });
  return;
}
```

↳ Notes:
- This makes Marketplace the canonical gate for what can be executed.

## Step 4 — Build skill execution order (auto-insert retrieval)

If the document pipeline is enabled, the runtime runs exactly one `retrieve_documents` step before the skill’s prompt nodes.

↳ Evidence:
- apps/api/src/lib/agent/runtime.ts:25–41

↳ Code:
```ts
if (!pipeline) return skillNodeNames;
const withoutRetrieve = skillNodeNames.filter((name) => name !== "retrieve_documents");
return ["retrieve_documents", ...withoutRetrieve];
```

↳ Notes:
- This prevents “forgot to add retrieval node” from silently disabling RAG.

## Step 5 — Retrieve document context for the user/query

Retrieval queries Weaviate (scoped by `userId`) and flattens matched chunk text into a single `context` string.

↳ Evidence:
- apps/api/src/lib/agent/runtime.ts:85–101
- apps/api/src/features/docs/document.pipeline.ts:165–195

↳ Code:
```ts
const results = await deps.pipeline.queryContext({ userId: state.userId, query: state.query, limit: 12 });
const context = results.map((r) => r.text).join("\n\n");
return { ...state, context, intermediate: { ...state.intermediate, retrieve_documents: results } };
```

↳ Notes:
- Context is per-user (not org-wide) in query; the org ID is stored on chunks but not used in nearest query here.

## Step 6 — Run a prompt node (template injection → LLM call)

Prompt templates can reference `{{query}}`, `{{context}}`, and `{{output}}`; if the template doesn’t include `{{context}}` but retrieval found context, the runtime appends a context block.

↳ Evidence:
- apps/api/src/lib/agent/runtime.ts:43–49
- apps/api/src/lib/agent/runtime.ts:104–126

↳ Code:
```ts
let userMessage = injectVariables(node.promptTemplate, state);
if (contextBlock.length > 0 && !templateUsesContext) {
  userMessage = `${userMessage}\n\n--- Retrieved document excerpts ---\n${contextBlock}`;
}
const response = await chatModel.invoke([new HumanMessage(userMessage)]);
```

↳ Notes:
- The runtime stores each node’s output into `state.intermediate[node.name]` and updates `state.output`.

## Step 7 — Presign document upload (S3 + DB row)

Presign creates a document UUID and S3 object key, stores a document row in Postgres, then returns the presigned PUT URL.

↳ Evidence:
- apps/api/src/features/docs/docs.routes.ts:169–213
- apps/api/src/features/docs/document.pipeline.ts:50–88

↳ Code:
```ts
const created = await deps.pipeline.createPresignedUpload({ userId, orgId, fileName, contentType });
response.json({ uploadUrl: created.uploadUrl, documentId: created.documentId, objectKey: created.objectKey });
```

↳ Notes:
- The stored metadata starts as `ingestStatus: "awaiting_upload"` and is updated on ingest completion.

## Step 8 — Ingest and index (extract → chunk → embed → Weaviate)

Ingest loads the object from storage, extracts text, chunks it, embeds each chunk, replaces any prior vectors for that document, and marks the document “ready”.

↳ Evidence:
- apps/api/src/features/docs/document.pipeline.ts:117–163

↳ Code:
```ts
const { buffer, contentType } = await deps.s3.getObjectBuffer(document.s3Url);
const text = await extractTextFromBuffer(buffer, resolvedType);
const chunks = chunkText(text);
const vectors = await deps.embeddings.embedTexts(chunks);
await deps.weaviate.insertChunks(chunks.map((chunk, index) => ({ text: chunk, chunkIndex: index })));
```

↳ Notes:
- Deletion + re-insert makes ingest effectively “reindex” for a given `docId`.
