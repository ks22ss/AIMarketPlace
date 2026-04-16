import type { PrismaClient } from "@prisma/client";

import { createDocumentPipeline } from "./document.pipeline.js";
import { createEmbeddingClient } from "./embeddings.js";
import { createS3Storage } from "./s3.storage.js";
import { createWeaviateStore } from "./weaviate.store.js";

/** DeepInfra OpenAI-compatible embeddings — https://deepinfra.com/openai */
const defaultEmbeddingBaseUrl = "https://api.deepinfra.com/v1/openai";

/** Default embedding model on DeepInfra (multilingual dense). */
const defaultEmbeddingModel = "BAAI/bge-m3-multi";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the document pipeline`);
  }
  return value;
}

function requireEmbeddingApiKey(): string {
  const key =
    process.env.DEEPINFRA_API_KEY?.trim() ||
    process.env.DEEPINFRA_TOKEN?.trim() ||
    process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "DEEPINFRA_API_KEY, DEEPINFRA_TOKEN, or OPENAI_API_KEY is required for the document pipeline (embeddings)",
    );
  }
  return key;
}

export function createDocumentPipelineFromEnv(prisma: PrismaClient) {
  const weaviateUrl = requireEnv("WEAVIATE_URL");
  const embeddingApiKey = requireEmbeddingApiKey();
  const embeddingBaseUrl =
    process.env.EMBEDDING_BASE_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    defaultEmbeddingBaseUrl;
  const embeddingModel =
    process.env.EMBEDDING_MODEL?.trim() || defaultEmbeddingModel;

  const s3 = createS3Storage({
    region: process.env.S3_REGION ?? "us-east-1",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: (process.env.S3_FORCE_PATH_STYLE ?? "true").toLowerCase() === "true",
    accessKeyId: requireEnv("S3_ACCESS_KEY"),
    secretAccessKey: requireEnv("S3_SECRET_KEY"),
    bucket: requireEnv("S3_BUCKET"),
  });

  const weaviateTimeoutParsed = Number(process.env.WEAVIATE_REQUEST_TIMEOUT_MS?.trim());
  const weaviate = createWeaviateStore({
    baseUrl: weaviateUrl,
    ...(Number.isFinite(weaviateTimeoutParsed) && weaviateTimeoutParsed > 0
      ? { requestTimeoutMs: weaviateTimeoutParsed }
      : {}),
  });
  const embeddings = createEmbeddingClient({
    apiKey: embeddingApiKey,
    baseUrl: embeddingBaseUrl,
    model: embeddingModel,
    encodingFormat: "float",
  });

  return createDocumentPipeline({ prisma, s3, weaviate, embeddings });
}
