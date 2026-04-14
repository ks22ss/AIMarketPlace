import { z } from "zod";

import type { PublicUser } from "../features/auth/auth.dto.js";

/** POST /api/auth/login and POST /api/auth/register success body (existing handlers). */
export type AuthTokenBundle = {
  accessToken: string;
  user: PublicUser;
};

/** GET /api/auth/me */
export type MeResponse = {
  user: PublicUser;
};

/** POST /api/chat */
export const chatPostBodySchema = z.object({
  message: z.string().min(1).max(16_000),
  skill_id: z.string().uuid().optional(),
});

export type ChatPostBody = z.infer<typeof chatPostBodySchema>;

export type ChatPostResponse = {
  reply: string;
  traceId: string;
};

/** POST /api/nodes — request body schema for create. */
export const nodeCreateBodySchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(8000).optional().nullable(),
  prompt_template: z.string().min(1).max(24_000),
  /** Prefer with `allow_role_slugs`; validated against `roles.slug` when legacy arrays are used. */
  allow_role: z.array(z.string().min(1).max(64)).max(32).optional(),
  /** Prefer with `allow_department_ids`; validated against `departments.name` when legacy arrays are used. */
  allow_department: z.array(z.string().min(1).max(128)).max(32).optional(),
  allow_department_ids: z.array(z.string().uuid()).max(32).optional(),
  allow_role_slugs: z.array(z.enum(["member", "admin"])).max(32).optional(),
});

export type NodeCreateBody = z.infer<typeof nodeCreateBodySchema>;

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

export type NodesListResponse = {
  nodes: NodeDto[];
};

export type NodeCreateResponse = {
  node_id: string;
  name: string;
};

/** GET /api/skills */
export type SkillSummaryDto = {
  skill_id: string;
  name: string;
  description: string | null;
  nodes: string[];
  org_id: string | null;
  created_at: string;
  access_summary: string;
};

export type SkillsListResponse = {
  skills: SkillSummaryDto[];
};

/** GET /api/marketplace/skills */
export type MarketplaceSkillSummaryDto = {
  skill_id: string;
  /** Hidden when `detail_hidden` (locked skill). */
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

/** POST /api/skills/install */
export const skillInstallBodySchema = z.object({
  skill_id: z.string().uuid(),
});

export type SkillInstallBody = z.infer<typeof skillInstallBodySchema>;

export type SkillInstallResponse = {
  installed: true;
  skill_id: string;
};

/** DELETE /api/skills/install/:skillId */
export type SkillUninstallResponse = {
  uninstalled: true;
  skill_id: string;
};

/** POST /api/skills (linear composable workflow) */
export const skillCreateBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(8000).optional().nullable(),
  /** Ordered node names (1–10), e.g. ["retrieve_documents","summarize"]. */
  nodes: z.array(z.string().min(1).max(200)).min(1).max(10),
  content: z.record(z.string(), z.unknown()).optional(),
  /** Empty / omitted = all departments in org. */
  allow_department_ids: z.array(z.string().uuid()).max(32).optional(),
  /** Empty / omitted = all roles in org. */
  allow_role_slugs: z.array(z.enum(["member", "admin"])).max(32).optional(),
});

export type SkillCreateBody = z.infer<typeof skillCreateBodySchema>;

export type SkillCreateResponse = {
  skill_id: string;
  name: string;
  version: number;
  nodes: string[];
};

/** GET /api/tools */
export type ToolSummaryDto = {
  tool_id: string;
  name: string;
  type: string;
};

export type ToolsListResponse = {
  tools: ToolSummaryDto[];
};

/** POST /api/tools/register */
export const toolRegisterBodySchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(128),
  config: z.record(z.string(), z.unknown()).optional(),
  allow_role: z.array(z.string()).optional(),
});

export type ToolRegisterBody = z.infer<typeof toolRegisterBodySchema>;

export type ToolRegisterResponse = {
  tool_id: string;
  name: string;
  type: string;
};

/** GET /api/docs — documents in the signed-in user's department (Postgres + S3 key + ingest metadata). */
export type DocumentSummaryDto = {
  document_id: string;
  created_at: string;
  /** Stored object key (S3/MinIO). */
  s3_object_key: string;
  file_name: string | null;
  content_type: string | null;
  ingest_status: string | null;
  chunk_count: number | null;
  /** True when ingest completed and chunks were written to Weaviate. */
  weaviate_indexed: boolean;
};

export type DocumentsListResponse = {
  documents: DocumentSummaryDto[];
};

/** DELETE /api/docs/:documentId */
export type DocsDeleteResponse = {
  deleted: true;
  document_id: string;
  /** When the document pipeline is off, only the Postgres row was removed. */
  storage_cleanup: "full" | "database_only";
};

/** POST /api/docs/presign */
export const docsPresignBodySchema = z.object({
  fileName: z.string().min(1).max(512),
  contentType: z.string().min(1).max(256),
});

export type DocsPresignBody = z.infer<typeof docsPresignBodySchema>;

export type DocsPresignResponse = {
  uploadUrl: string;
  documentId: string;
  expiresAt: string;
  /** S3 object key (same as stored `Document.s3Url`). */
  objectKey: string;
};

/** POST /api/docs/ingest */
export const docsIngestBodySchema = z.object({
  documentId: z.string().uuid(),
});

export type DocsIngestBody = z.infer<typeof docsIngestBodySchema>;

export type DocsIngestResponse = {
  documentId: string;
  status: "ready";
  chunkCount: number;
};

/** POST /api/docs/query — embed query and return nearest chunks (RAG context). */
export const docsQueryBodySchema = z.object({
  query: z.string().min(1).max(4000),
  limit: z.number().int().min(1).max(20).optional(),
});

export type DocsQueryBody = z.infer<typeof docsQueryBodySchema>;

export type DocsQueryChunk = {
  text: string;
  doc_id: string;
  chunk_index: number;
  /** Distance from Weaviate `nearVector` (lower is closer for cosine-backed indexes). */
  score: number;
};

export type DocsQueryResponse = {
  chunks: DocsQueryChunk[];
};

/** PUT /api/config/llm */
export const configLlmPutBodySchema = z.object({
  model: z.string().min(1).max(128),
  temperature: z.number().min(0).max(2),
});

export type ConfigLlmPutBody = z.infer<typeof configLlmPutBodySchema>;

export type ConfigLlmPutResponse = {
  model: string;
  temperature: number;
  updatedAt: string;
};
