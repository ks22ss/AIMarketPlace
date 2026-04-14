# 🧾 spec.md — Agentic AI Marketplace Platform

---

# 🎯 1. Objective

Build a **multi-tenant internal AI marketplace platform** where users can:

* Chat with a default agent
* Install **skills (agent workflows)**
* Use **tools (APIs/functions)**
* Upload documents for RAG
* Configure models
* Run **agentic workflows (LangGraph)**
* Ensure quality via **Promptfoo + RAGAS**
* Monitor via **LangSmith**

---

# 🧱 2. High-Level Architecture

```
Frontend (React + TypeScript + Tailwind CSS + shadcn/ui; TanStack Query + React Router + Zustand — see section 15)
        ↓
Backend API (Express.js API Routes + TypeScript)
        ↓
Agent Runtime (LangGraph)
        ↓
 ┌──────────────┬──────────────┬──────────────┐
 ↓              ↓              ↓
Weaviate     Tool Executor    LLM API
(Vector DB)  (Node Service)   (Minmax/OpenAI)

        ↓
Storage Layer:
- Postgres (state/config)
- Redis (cache + short memory)
- S3 (documents)

        ↓
Evaluation Layer:
- Promptfoo
- RAGAS

        ↓
Observability:
- LangSmith
```

---

# 🧠 3. Core Concepts

## Skill

Reusable **agent workflow module**

* Defined as LangGraph subgraph
* Contains tools + prompts

## Tool

Executable function/API

* Structured schema
* Called by agent

## Agent Runtime

LangGraph-based execution engine:

* planner → select → execute → critique → loop

---

# 🗄️ 4. Database Design

## Users

```sql
users (
  user_id UUID PK,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT,
  department TEXT,
  org_id UUID,
  llm_config JSONB,
  created_at TIMESTAMP
)
```

---

## Skills

```sql
skills (
  skill_id UUID PK,
  name TEXT,
  description TEXT,
  content JSONB,
  version INT,
  allow_role TEXT[],
  allow_department TEXT[],
  created_by UUID,
  created_at TIMESTAMP
)
```

---

## Tools

```sql
tools (
  tool_id UUID PK,
  name TEXT,
  type TEXT,
  config JSONB,
  version INT,
  allow_role TEXT[],
  created_at TIMESTAMP
)
```

---

## Skill_Tools

```sql
skill_tools (
  skill_id UUID,
  tool_id UUID
)
```

---

## User_Skills (installed)

```sql
user_skills (
  user_id UUID,
  skill_id UUID
)
```

---

## Documents

```sql
documents (
  doc_id UUID PK,
  user_id UUID,
  org_id UUID,
  s3_url TEXT,
  metadata JSONB,
  created_at TIMESTAMP
)
```

---

# 🧲 5. Vector DB (Weaviate)

Schema:

* class: `DocumentChunk`

  * text
  * embedding
  * user_id
  * org_id
  * doc_id

---

# 🧠 6. Redis Usage

* conversation memory
* caching:

  * embeddings
  * retrieval results
  * LLM responses (optional)

---

# ☁️ 7. S3 Design

Path:

```
/org_id/user_id/doc_id/file.pdf
```

Use:

* presigned upload URL

---

# 🔌 8. API Design

## Auth

### POST /api/auth/register

### POST /api/auth/login

---

## Chat / Agent

### POST /api/chat

Request:

```json
{
  "message": "string"
}
```

Flow:

1. fetch user config
2. load installed skills
3. call Agent Runtime
4. return response

---

## Skills

### GET /api/skills

List available skills

### POST /api/skills/install

```json
{
  "skill_id": "uuid"
}
```

### POST /api/skills/create

* create new skill

---

## Tools

### GET /api/tools

### POST /api/tools/register

---

## Documents

### POST /api/docs/presign

→ returns upload URL

### POST /api/docs/ingest

* trigger embedding + indexing

---

## Config

### PUT /api/config/llm

```json
{
  "model": "minmax",
  "temperature": 0.7
}
```

---

# 🤖 9. Agent Runtime (LangGraph)

**MVP note:** `POST /api/chat` runs skills as a **linear ordered node chain** (variable injection plus optional `retrieve_documents`), not the LangGraph planner loop sketched below. LangGraph remains in use for document/RAG paths and can replace or augment chat execution later.

## Flow

```
User Input
   ↓
Intent Parser
   ↓
Planner
   ↓
Skill Selector
   ↓
Execution Node
   ↓
Tool Router
   ↓
Critic Node
   ↓
Loop Controller
   ↓
Final Output
```

---

## Skill Selection

Hybrid:

* embedding similarity
* LLM reasoning

---

## Tool Execution

* validate schema
* execute API
* return structured JSON

---

## Failure Handling

* retry (max 2)
* fallback tool
* degrade response

---

# 🧪 10. Evaluation Pipeline

## Promptfoo

* test cases:

  * input → expected output

## RAGAS

* evaluate:

  * faithfulness
  * relevance
  * answer correctness

---

## Flow

```
Skill Created
   ↓
Run Promptfoo
   ↓
Run RAGAS
   ↓
If pass → publish
Else → reject
```

---

# 🔍 11. Observability (LangSmith)

Track:

* agent steps
* tool calls
* latency
* errors

---

# 🔐 12. Security

* RBAC (role-based)
* department access
* tool permission validation
* skill permission validation

---

# 🧠 13. Multi-Tenancy

* org_id everywhere
* S3 isolation
* Weaviate namespace
* Postgres filtering

---

# ⚙️ 14. CI/CD (Terraform + GitHub Actions)

## Steps

1. Build
2. Run tests
3. Run Promptfoo
4. Run RAGAS
5. Deploy to AWS

---

## Infra (Terraform)

* ECS / EKS
* RDS (Postgres)
* ElastiCache (Redis)
* S3
* API Gateway

---

# 🧩 15. Components

## Frontend

* Chat UI
* Marketplace UI
* Skill config UI
* Logs / observability UI

**Implementation note (phase 1):** The web app is **Vite + React + TypeScript** with **Tailwind CSS v4** and **[shadcn/ui](https://ui.shadcn.com/)** (design tokens, `components/ui`, Geist font). TanStack Query, React Router, and Zustand from the architecture diagram are still **targets** for later milestones.

---

## Backend

* API routes
* Agent runtime
* Tool executor
* ingestion pipeline

---

# ✅ 16. Happy Path

## Chat

1. user sends message
2. backend loads config
3. agent selects skill
4. tools executed
5. response returned

---

## Document Upload

1. request presigned URL
2. upload to S3
3. call ingest
4. embed + store in Weaviate

---

## Skill Install

1. user clicks install
2. saved in user_skills
3. available in runtime

---

# ⚠️ 17. Edge Cases

## Agent

* no skill matched → fallback to base LLM
* tool failure → retry / fallback
* empty retrieval → ask clarification

---

## Data

* duplicate document → dedupe via hash
* embedding failure → retry queue

---

## System

* Redis down → fallback stateless mode
* Weaviate slow → degrade to LLM-only

---

## Security

* unauthorized skill → block execution
* tool misuse → validate schema strictly

---

# 🚀 18. MVP Scope (IMPORTANT)

Start with:

* chat + 1 agent flow
* basic skill system
* 1 tool (retriever)
* document upload + RAG
* no UI polish

---

# 🧠 19. Key Design Principles

* composability (skills as modules)
* observability-first
* evaluation-first
* multi-tenant safe
* agent-driven, not user-command-driven

---

# 🎯 Final Note

This is not a chatbot.

This is:

> **A composable, observable, and evaluatable agent platform designed for enterprise use**

---
