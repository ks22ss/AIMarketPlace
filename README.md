# AI Marketplace Platform

Monorepo for an internal-style **AI marketplace**: JWT auth, org-scoped **prompt nodes** and **skills** (ordered workflows), **marketplace** listing, **document upload + RAG** (S3/MinIO, Weaviate, embeddings), and **chat** that runs installed skills.

Behavior is defined by the code; for a route-by-route picture see **`docs/spec.md`**.

## Architecture (as wired)

```
React (Vite) → Express API → PostgreSQL (Prisma)

Document pipeline (when env is valid): S3/MinIO, embeddings API, Weaviate

Chat: linear skill runner + optional retrieve_documents (uses the same pipeline)
```

- **LangGraph** is installed and a sample RAG graph exists under `apps/api/src/features/chat/rag-agent.graph.ts`, but **HTTP `/api/chat` does not use it** — chat goes through `lib/agent/runtime.ts` (`runSkill`).
- **Redis** is defined in `docker-compose.yml` and `REDIS_URL` appears in `.env.example`, but **no TypeScript in this repo connects to Redis**.

## Tech stack

| Layer | Technologies |
|-------|----------------|
| Frontend | React 18, TypeScript, Vite 6, Tailwind CSS 4, React Router 7, shadcn-related UI deps, Geist font |
| Backend | Node.js, Express, TypeScript, Zod, Prisma, bcryptjs, jsonwebtoken |
| LLM / agents | LangChain (`@langchain/openai`, `@langchain/core`), OpenAI-compatible APIs for chat and embeddings |
| RAG | Weaviate 1.27 (class `DocumentChunk`), AWS SDK S3 client (MinIO locally), `pdf-parse` + text extractors for listed MIME/types |
| CI | GitHub Actions: Node 22, `npm ci`, workspace build, Vitest in `apps/api`, Playwright |

## Document RAG pipeline (actual steps)

1. **Presign** — `POST /api/docs/presign` creates a `Document` row and returns a presigned PUT URL; object key shape `{org}/{user}/{docId}/{file}` (see `document.pipeline.ts`).
2. **Upload** — client PUTs the file to storage.
3. **Ingest** — `POST /api/docs/ingest` loads the object, extracts text (PDF, TXT, MD, CSV, JSON, XML, HTML), **chunks** (default **1200** chars, **150** overlap), **embeds** in batches of **64**, writes vectors to Weaviate, updates document metadata.
4. **Query** — `POST /api/docs/query` embeds the query and runs near-vector search with a **user_id** filter (default limit **8**).

Chat-time retrieval uses the same pipeline with **limit 12** when the synthetic `retrieve_documents` step runs.

## Skills and chat

- Skills store an ordered list of **node names** (plus optional implicit `retrieve_documents` when the pipeline is enabled).
- **Nodes** are DB-backed prompt templates with `{{query}}`, `{{context}}`, `{{output}}` substitution.
- **POST `/api/chat`** requires an **installed** skill (`POST /api/skills/install`), matching allow lists, and a configured chat API key / model (`chat-llm.ts`).
- **Tools**: `GET /api/tools` returns an empty list; `POST /api/tools/register` does not persist — stubs only.
- **PUT `/api/config/llm`**: validates input and returns a payload; **does not save** user LLM preferences to the database.

## Multi-tenancy and security (what the code enforces)

- New users get a shared **`DEFAULT_ORG_ID`** on signup (`org-config.ts`); nodes and chat resolve org scope from `user.orgId ?? user.userId`.
- Users have **department** and **role**; skills and nodes have allow lists resolved against those values for create/install/run where implemented.
- **Weaviate queries filter by `user_id`**, not by department name in the vector schema.
- JWT auth on protected routes; CORS is permissive in development (`origin: true` in `index.ts`).

## AWS Terraform (`infra/`)

S3 uploads bucket (encryption, public access block, optional versioning and CORS). This repo’s Terraform does **not** provision RDS, Redis/ElastiCache, ECS/EKS, or API Gateway.

## Getting started

```bash
docker compose up -d
npm install
npm run db:deploy -w apps/api
npm run dev
```

- API: `http://localhost:3001` (default). Web: Vite dev server (see `apps/web` / root `npm run dev`).
- Copy `.env.example` to `.env` and set at least `JWT_SECRET`, `DATABASE_URL`, and (for RAG) embedding + S3 + Weaviate variables as described in `.env.example`.

## Project structure

```
apps/api/src/features/   # auth, chat, docs, skills, nodes, marketplace, tools, config, reference
apps/api/prisma/         # schema & migrations
apps/web/src/            # pages, auth, components
infra/                   # Terraform (S3-focused)
tests/                   # Playwright tests
docs/spec.md             # As-implemented specification
```

## CI

On push/PR to `master`: install, build workspaces, **Vitest** (`@aimarketplace/api`), **Playwright** E2E. No Promptfoo/RAGAS jobs in the workflow file.

Optional **LangSmith** tracing works when `LANGSMITH_*` env vars are set (LangChain); nothing in CI requires them.
