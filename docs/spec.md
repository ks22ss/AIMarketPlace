# Specification (as implemented)

This document describes behavior that exists in the repository today: routes, persistence, and runtime wiring.

## 1. System overview

- **Web app**: Vite + React 18 + TypeScript, Tailwind CSS v4, shadcn/ui-style components, React Router v7. No TanStack Query or Zustand in `apps/web` dependencies.
- **API**: Express (TypeScript) on port `3001` by default (`PORT`). Loads env from repo-root `.env` (see `apps/api/src/env.ts`).
- **Monorepo scripts** (root `package.json`): `npm run dev` runs API and web via `concurrently`; `npm run build` builds all workspaces that define `build`.

## 2. Local infrastructure (`docker-compose.yml`)

Services started for local development:

| Service    | Purpose |
|-----------|---------|
| PostgreSQL 16 | Primary application database (`DATABASE_URL`). |
| Redis 7 | Container only; **no application code reads `REDIS_URL` or connects to Redis**. |
| Weaviate 1.27 | Vector store for document chunks (`WEAVIATE_URL`). |
| MinIO | S3-compatible API for uploads (`S3_ENDPOINT`, path-style). |

If embedding/S3/Weaviate configuration is missing or invalid, the API still starts; the document pipeline is disabled and `/api/docs` returns `503` for pipeline-dependent operations (see startup logs in `apps/api/src/index.ts`).

## 3. Data model (Prisma)

Source: `apps/api/prisma/schema.prisma`.

- **Department**, **Role**: reference tables (e.g. registration uses departments; roles seeded as `member`, `admin`).
- **User**: `user_id`, `email`, `password_hash`, `role` (slug string), `department_id` → Department, optional `org_id`, `llm_config` JSON, timestamps. **Registration** sets `org_id` to the shared constant `DEFAULT_ORG_ID` in `lib/org-config.ts` (single-tenant-style org for all new members).
- **Node**: org-scoped named prompt templates (`org_id` + unique `name`), allow lists for role slugs and department names.
- **Skill**: `skill_nodes` JSON array of node name strings (workflow order), allow lists, optional `org_id`, `created_by`.
- **Tool**, **SkillTool**: tables exist; see §8 for current API behavior.
- **UserSkill**: installed skills per user (composite PK).
- **Document**: `doc_id`, optional `user_id` / `org_id`, `s3_url` (object key), `metadata` JSON (ingest status, chunk count, filenames, etc.).

## 4. Object storage (S3 / MinIO)

- **Key layout** (see `document.pipeline.ts`): `{orgKey}/{userId}/{documentId}/{sanitizedFileName}` where `orgKey` is the user’s `org_id` or a zero UUID placeholder when null.
- **Presigned upload**: `PutObjectCommand` via AWS SDK v3; no extra encryption fields on the presign call. **Terraform** for AWS defines default bucket SSE (`AES256`) for the uploads bucket; local MinIO behavior depends on server config.

## 5. Weaviate

- **Class**: `DocumentChunk` (created if missing).
- **Properties**: `text`, `user_id`, `org_id`, `doc_id`, `chunk_index`; vectors supplied at insert (`vectorizer: none`).
- **Similarity**: cosine (`vectorIndexConfig.distance`).
- **Query filter**: GraphQL `where` on `user_id` **only** (see `weaviate.store.ts`). Retrieval is **per uploading user**, not per department name in the vector index.

## 6. Document pipeline

1. **POST `/api/docs/presign`** (auth): creates `Document` row, returns presigned `uploadUrl`, `documentId`, `objectKey`.
2. Client uploads bytes to storage.
3. **POST `/api/docs/ingest`** (auth): downloads object, extracts text, chunks, embeds, deletes prior chunks for that doc/user, inserts into Weaviate, updates metadata (`ingestStatus: ready`, `chunkCount`).
4. **Chunking**: `chunkText` in `chunking.ts` — default **1200** characters, **150** overlap.
5. **Embeddings**: OpenAI-compatible client; batches of **64** texts per request (`embeddings.ts`).
6. **GET `/api/docs`**: lists current user’s documents and ingest metadata.
7. **DELETE `/api/docs/:documentId`**: owner-only; with pipeline enabled, deletes DB row, S3 object, and Weaviate chunks; without pipeline, may delete DB only.
8. **POST `/api/docs/query`** (auth): embeds query string, nearest-vector search filtered by `user_id`; request body `limit` defaults to **8** (capped 1–100 in store).

**Supported ingest types** (see `extract-text.ts`): PDF, plain text, Markdown, CSV, JSON, XML, HTML (by MIME or extension).

## 7. Authentication and access control

- **POST `/api/auth/register`**, **POST `/api/auth/login`**, **GET `/api/auth/me`** (JWT in `Authorization: Bearer`).
- Skills and nodes enforce **allow_role** and **allow_department** lists where applicable (`userMatchesAllowLists`, `resolveAllowLists`).
- **POST `/api/chat`** requires the skill to be **installed** (`UserSkill`) and allowed for the user’s role/department.

## 8. Chat and skill runtime

- **POST `/api/chat`**: body `message`, optional `skill_id` (`public-api.ts`). Requires a configured chat model (`CHAT_API_KEY` or `OPENAI_API_KEY` or `MINIMAX_API_KEY`, plus base URL / `LLM_MODEL` — see `chat-llm.ts`). Returns `reply` and `traceId` (UUID generated per request; not a persisted trace id).
- **Execution** (`lib/agent/runtime.ts`): **linear** execution over an ordered list of node names. If the document pipeline is enabled, a synthetic first step **`retrieve_documents`** is prepended (and duplicates of that name in the skill are stripped) so one vector query runs before prompt nodes.
- **`retrieve_documents`**: calls `pipeline.queryContext` with **limit 12**, joins chunk texts into `context`.
- **Prompt nodes**: load `Node` by org + name; substitute `{{query}}`, `{{context}}`, `{{output}}`; if the template omits `{{context}}` but context exists, context is appended; if retrieval ran but context is empty, an explicit “no excerpts” line may be appended. One LLM call per prompt node via LangChain `ChatOpenAI.invoke`.
- **LangGraph**: `@langchain/langgraph` is a dependency, and `features/chat/rag-agent.graph.ts` defines a small plan → retrieve → answer graph using the OpenAI SDK — **this graph is not imported by `index.ts` or `chat.routes.ts`**. HTTP chat uses `runSkill` only.

## 9. Tools API (stub)

- **GET `/api/tools`**: always returns `{ "tools": [] }`.
- **POST `/api/tools/register`**: validates body, responds `201` with a **random UUID** and echo of name/type — **does not write to the database** and does not attach tools to skills in a persisted way.

## 10. Config API (stub)

- **PUT `/api/config/llm`**: validates body, returns JSON with model, temperature, and `updatedAt` — **does not persist** to `User.llmConfig` or elsewhere.

## 11. Reference data

- **GET `/api/reference/departments`**: lists departments.
- **GET `/api/reference/roles`**: lists roles.

## 12. Nodes and skills (persisted)

- **GET/POST `/api/nodes`**: list and create org-scoped nodes (prompt templates, allow lists). System-reserved name: `retrieve_documents` cannot be used as a user node name (see `node-naming` / routes).
- **GET `/api/skills`**, **POST `/api/skills`**, deprecated **POST `/api/skills/create`**, **POST `/api/skills/install`**, **DELETE `/api/skills/install/:skillId`**: list/create/install/uninstall skills; nodes in the skill must exist and be accessible unless the name is the system retrieve step.

## 13. Marketplace

- **GET `/api/marketplace/skills`**: paginated, org-visible skills with `accessible` / `detail_hidden` / `installed` flags for the current user.

## 14. Health

- **GET `/health`**, **GET `/api/health`**: JSON `{ status, service, timestamp }`.

## 15. Observability

- **LangSmith**: optional; LangChain’s ecosystem picks up `LANGSMITH_*` when set (comment in `chat-llm.ts`). No custom LangSmith UI in this repo.
- **Promptfoo / RAGAS / evaluation gates**: **not** present in CI or application code paths documented here.

## 16. CI (`.github/workflows/ci.yml`)

On push/PR to `master`: `npm ci`, Playwright browser install, `npm run build`, `npm run test -w @aimarketplace/api` (Vitest), `npx playwright test`. No Terraform apply or deployment in this workflow.

## 17. Terraform (`infra/`)

AWS resources include an S3 uploads bucket with public access blocked, default **AES256** encryption, optional versioning, CORS for browser uploads when variables are set, and related IAM. **No RDS, ElastiCache, ECS/EKS, or API Gateway** definitions in this Terraform layout as checked against `main.tf` / related files.

## 18. Frontend routes (`apps/web/src/main.tsx`)

Authenticated shell: `/` (Chat), `/nodes`, `/skills`, `/documents`, `/marketplace`. Auth routes: `/login`, `/register`.

Legacy paths redirect:

- `/chat` → `/`
- `/skills/build` → `/skills`
- `/docs/rag` → `/documents`
- `/nodes/build` → `/nodes`
