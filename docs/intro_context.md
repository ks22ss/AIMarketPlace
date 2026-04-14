# What This System Does
An internal, multi-tenant AI marketplace where authenticated users install “skills” (workflows) and run them in chat, optionally grounded in their uploaded documents.

# Core Idea
Skills are stored as an ordered list of node names; the backend executes them as a **linear chain** of prompt nodes, optionally inserting a **retrieve_documents** step to pull relevant document chunks first.

# Entry Points
- HTTP: `GET /health` → Express handler (`apps/api/src/index.ts`)
- HTTP: `POST /api/auth/register` → auth controller (`apps/api/src/features/auth/auth.routes.ts`)
- HTTP: `POST /api/auth/login` → auth controller (`apps/api/src/features/auth/auth.routes.ts`)
- HTTP: `POST /api/skills/install` → install skill (`apps/api/src/features/skills/skills.routes.ts`)
- HTTP: `GET /api/marketplace/skills` → list skills + access/installed flags (`apps/api/src/features/marketplace/marketplace.routes.ts`)
- HTTP: `POST /api/chat` → run installed skill workflow (`apps/api/src/features/chat/chat.routes.ts`)
- HTTP: `POST /api/docs/presign` → create presigned upload + DB row (`apps/api/src/features/docs/docs.routes.ts`)
- HTTP: `POST /api/docs/ingest` → extract → chunk → embed → index (`apps/api/src/features/docs/docs.routes.ts`)
- HTTP: `POST /api/docs/query` → semantic search over indexed chunks (`apps/api/src/features/docs/docs.routes.ts`)

# Core Components
- `createAuthService` → register/login + JWT issuance (`apps/api/src/features/auth/auth.service.ts`)
- `requireAuth` middleware → Bearer token verification (`apps/api/src/features/auth/auth.middleware.ts`)
- `createMarketplaceRouter` → paged skill catalog with installed/access markers (`apps/api/src/features/marketplace/marketplace.routes.ts`)
- `runSkill` runtime → execute ordered nodes + optional retrieval (`apps/api/src/lib/agent/runtime.ts`)
- `DocumentPipeline` → presign uploads, ingest, query, delete (`apps/api/src/features/docs/document.pipeline.ts`)
- Web app router → pages for Chat/Marketplace/Documents (`apps/web/src/main.tsx`)

# Data Flow (Simplified)
Web UI → Express API → (Prisma DB reads/writes) → (optional: S3 + embeddings API + Weaviate) → response to UI

# External Dependencies
- Postgres via Prisma (users/skills/nodes/documents)
- S3-compatible object storage (document uploads)
- Embeddings API (DeepInfra/OpenAI-compatible)
- Weaviate (vector index for document chunks)
- LLM API via LangChain `ChatOpenAI` (chat/skill execution)

# Output / End States
- User session token (JWT) for authenticated API calls
- Installed skills list per user, and runnable “skill chat”
- Uploaded documents indexed into vectors; chat can incorporate retrieved excerpts into prompts
