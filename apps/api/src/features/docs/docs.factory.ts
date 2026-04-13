import type { PrismaClient } from "@prisma/client";

import { createDocumentPipeline } from "./document.pipeline.js";
import { createEmbeddingClient } from "./embeddings.js";
import { createS3Storage } from "./s3.storage.js";
import { createWeaviateStore } from "./weaviate.store.js";

/** MiniMax OpenAI-compatible API — https://platform.minimax.io/docs/api-reference/text-openai-api */
const defaultMiniMaxOpenAiBaseUrl = "https://api.minimax.io/v1";

/** Default text-embedding model id for MiniMax `/v1/embeddings` (OpenAI-compatible). */
const defaultMiniMaxEmbeddingModel = "embo-01";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the document pipeline`);
  }
  return value;
}

export function createDocumentPipelineFromEnv(prisma: PrismaClient) {
  const weaviateUrl = requireEnv("WEAVIATE_URL");
  const openaiKey = requireEnv("OPENAI_API_KEY");
  const embeddingBaseUrl =
    process.env.OPENAI_BASE_URL?.trim() || defaultMiniMaxOpenAiBaseUrl;
  const embeddingModel =
    process.env.EMBEDDING_MODEL?.trim() || defaultMiniMaxEmbeddingModel;

  const s3 = createS3Storage({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() === "true",
    accessKeyId: requireEnv("S3_ACCESS_KEY"),
    secretAccessKey: requireEnv("S3_SECRET_KEY"),
    bucket: requireEnv("S3_BUCKET"),
  });

  const weaviate = createWeaviateStore({ baseUrl: weaviateUrl });
  const embeddings = createEmbeddingClient({
    apiKey: openaiKey,
    baseUrl: embeddingBaseUrl,
    model: embeddingModel,
  });

  return createDocumentPipeline({ prisma, s3, weaviate, embeddings });
}
