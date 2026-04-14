import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { chunkText } from "./chunking.js";
import type { EmbeddingClient } from "./embeddings.js";
import { extractTextFromBuffer, resolveIngestContentType } from "./extract-text.js";
import type { S3Storage } from "./s3.storage.js";
import type { WeaviateStore } from "./weaviate.store.js";

export type DocumentPipelineDeps = {
  prisma: PrismaClient;
  s3: S3Storage;
  weaviate: WeaviateStore;
  embeddings: EmbeddingClient;
};

function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "upload";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200);
}

function orgKey(orgId: string | null): string {
  return orgId ?? "00000000-0000-0000-0000-000000000000";
}

function buildObjectKey(params: {
  orgId: string | null;
  userId: string;
  documentId: string;
  fileName: string;
}): string {
  const safeName = sanitizeFileName(params.fileName);
  return `${orgKey(params.orgId)}/${params.userId}/${params.documentId}/${safeName}`;
}

function readMetadata(metadata: Prisma.JsonValue): Prisma.JsonObject {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Prisma.JsonObject;
  }
  return {};
}

export function createDocumentPipeline(deps: DocumentPipelineDeps) {
  async function bootstrapInfrastructure(): Promise<void> {
    await deps.s3.ensureBucket();
    await deps.weaviate.ensureDocumentChunkClass();
  }

  async function createPresignedUpload(input: {
    userId: string;
    orgId: string | null;
    departmentId: string;
    fileName: string;
    contentType: string;
  }): Promise<{ uploadUrl: string; documentId: string; expiresAt: string; objectKey: string }> {
    const documentId = randomUUID();
    const objectKey = buildObjectKey({
      orgId: input.orgId,
      userId: input.userId,
      documentId,
      fileName: input.fileName,
    });

    const expiresSeconds = 15 * 60;
    const uploadUrl = await deps.s3.presignPutObject({
      objectKey,
      contentType: input.contentType,
      expiresSeconds,
    });

    const expiresAt = new Date(Date.now() + expiresSeconds * 1000).toISOString();

    await deps.prisma.document.create({
      data: {
        docId: documentId,
        userId: input.userId,
        departmentId: input.departmentId,
        orgId: input.orgId,
        s3Url: objectKey,
        metadata: {
          fileName: input.fileName,
          contentType: input.contentType,
          ingestStatus: "awaiting_upload",
        },
      },
    });

    return { uploadUrl, documentId, expiresAt, objectKey };
  }

  async function ingestDocument(input: { userId: string; departmentId: string; documentId: string }): Promise<{
    documentId: string;
    status: "ready";
    chunkCount: number;
  }> {
    const document = await deps.prisma.document.findUnique({
      where: { docId: input.documentId },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    const ownerId = document.userId;
    if (!ownerId) {
      throw new Error("Document not found");
    }

    if (ownerId !== input.userId) {
      throw new Error("Forbidden");
    }

    if (document.departmentId !== input.departmentId) {
      throw new Error("Forbidden");
    }

    const metadata = readMetadata(document.metadata);
    const storedContentType =
      typeof metadata.contentType === "string" ? metadata.contentType : "application/octet-stream";
    const fileName = typeof metadata.fileName === "string" ? metadata.fileName : "";

    const { buffer, contentType: s3ContentType } = await deps.s3.getObjectBuffer(document.s3Url);
    const resolvedType = resolveIngestContentType({
      s3ContentType,
      storedContentType,
      fileName,
    });

    const text = await extractTextFromBuffer(buffer, resolvedType);
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      throw new Error("No text extracted for ingest");
    }

    const vectors = await deps.embeddings.embedTexts(chunks);
    if (vectors.length !== chunks.length) {
      throw new Error("Embedding count mismatch");
    }

    const orgIdValue = orgKey(document.orgId);

    await deps.weaviate.deleteChunksForDocument(document.docId);

    await deps.weaviate.insertChunks(
      chunks.map((chunk, index) => ({
        vector: vectors[index] ?? [],
        text: chunk,
        userId: ownerId,
        orgId: orgIdValue,
        departmentId: document.departmentId,
        documentId: document.docId,
        chunkIndex: index,
      })),
    );

    await deps.prisma.document.update({
      where: { docId: document.docId },
      data: {
        metadata: {
          ...metadata,
          ingestStatus: "ready",
          chunkCount: chunks.length,
          contentType: resolvedType,
        },
      },
    });

    return { documentId: document.docId, status: "ready", chunkCount: chunks.length };
  }

  async function queryContext(input: {
    departmentId: string;
    query: string;
    limit: number;
  }): Promise<
    Array<{
      text: string;
      doc_id: string;
      chunk_index: number;
      score: number;
    }>
  > {
    const vectors = await deps.embeddings.embedTexts([input.query]);
    const vector = vectors[0];
    if (!vector) {
      throw new Error("Failed to embed query");
    }

    const matches = await deps.weaviate.queryNearest({
      vector,
      departmentId: input.departmentId,
      limit: input.limit,
    });

    return matches.map((match) => ({
      text: match.text,
      doc_id: match.doc_id,
      chunk_index: match.chunk_index,
      score: match.distance,
    }));
  }

  async function deleteUserDocument(input: {
    userId: string;
    departmentId: string;
    documentId: string;
  }): Promise<void> {
    const document = await deps.prisma.document.findUnique({
      where: { docId: input.documentId },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    const ownerId = document.userId;
    if (!ownerId || ownerId !== input.userId) {
      throw new Error("Forbidden");
    }

    if (document.departmentId !== input.departmentId) {
      throw new Error("Forbidden");
    }

    await deps.weaviate.deleteChunksForDocument(document.docId);
    await deps.s3.deleteObject(document.s3Url);
    await deps.prisma.document.delete({
      where: { docId: document.docId },
    });
  }

  return {
    bootstrapInfrastructure,
    createPresignedUpload,
    ingestDocument,
    queryContext,
    deleteUserDocument,
  };
}

export type DocumentPipeline = ReturnType<typeof createDocumentPipeline>;
