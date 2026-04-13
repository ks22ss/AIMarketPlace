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
});

export type ChatPostBody = z.infer<typeof chatPostBodySchema>;

export type ChatPostResponse = {
  reply: string;
  traceId: string;
};

/** GET /api/skills */
export type SkillSummaryDto = {
  skill_id: string;
  name: string;
  description: string | null;
};

export type SkillsListResponse = {
  skills: SkillSummaryDto[];
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

/** POST /api/skills/create */
export const skillCreateBodySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(8000).optional().nullable(),
  content: z.record(z.string(), z.unknown()).optional(),
});

export type SkillCreateBody = z.infer<typeof skillCreateBodySchema>;

export type SkillCreateResponse = {
  skill_id: string;
  name: string;
  version: number;
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
