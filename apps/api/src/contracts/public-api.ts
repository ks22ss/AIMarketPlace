import { z } from "zod";

import type { PublicUser } from "../features/auth/auth.dto.js";

/** POST /api/auth/login and POST /api/auth/register success body (existing handlers). */
export type AuthTokenBundle = {
  accessToken: string;
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
  skillId: string;
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
  skillId: string;
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
};

/** POST /api/docs/ingest */
export const docsIngestBodySchema = z.object({
  documentId: z.string().uuid(),
});

export type DocsIngestBody = z.infer<typeof docsIngestBodySchema>;

export type DocsIngestResponse = {
  documentId: string;
  status: "queued" | "processing";
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
