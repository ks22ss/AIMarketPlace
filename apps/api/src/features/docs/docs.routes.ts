import type { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import {
  docsIngestBodySchema,
  type DocsDeleteResponse,
  type DocsIngestResponse,
  docsPresignBodySchema,
  type DocsPresignResponse,
  docsQueryBodySchema,
  type DocsQueryResponse,
  type DocumentsListResponse,
  type DocumentSummaryDto,
} from "../../contracts/public-api.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import type { DocumentPipeline } from "./document.pipeline.js";

export type DocsRouterDeps = {
  prisma: PrismaClient;
  /** When null (e.g. missing embedding API key), document routes return 503. */
  pipeline: DocumentPipeline | null;
};

function respondPipelineDisabled(response: import("express").Response): void {
  response.status(503).json({
    error: "Document pipeline is not configured",
    detail:
      "Set DEEPINFRA_API_KEY (or DEEPINFRA_TOKEN / OPENAI_API_KEY), WEAVIATE_URL, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET (see .env.example).",
  });
}

function readDocMetadata(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return {};
}

function mapPipelineError(error: unknown, response: import("express").Response): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message;
  if (message === "Forbidden") {
    response.status(403).json({ error: message });
    return true;
  }
  if (message === "Document not found") {
    response.status(404).json({ error: message });
    return true;
  }
  if (
    message.startsWith("Unsupported content type") ||
    message === "No text extracted for ingest" ||
    message === "Embedding count mismatch"
  ) {
    response.status(400).json({ error: message });
    return true;
  }
  return false;
}

export function createDocsRouter(deps: DocsRouterDeps): Router {
  const router = Router();

  router.get(
    "/",
    requireAuth,
    asyncHandler(async (request, response) => {
      const authUser = request.authUser;
      if (!authUser) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const rows = await deps.prisma.document.findMany({
        where: { userId: authUser.userId },
        orderBy: { createdAt: "desc" },
      });

      const documents: DocumentSummaryDto[] = rows.map((row) => {
        const meta = readDocMetadata(row.metadata);
        const ingestStatus = typeof meta.ingestStatus === "string" ? meta.ingestStatus : null;
        const fileName = typeof meta.fileName === "string" ? meta.fileName : null;
        const contentType = typeof meta.contentType === "string" ? meta.contentType : null;
        const chunkCount = typeof meta.chunkCount === "number" ? meta.chunkCount : null;
        const weaviateIndexed = ingestStatus === "ready" && typeof chunkCount === "number";

        return {
          document_id: row.docId,
          created_at: row.createdAt.toISOString(),
          s3_object_key: row.s3Url,
          file_name: fileName,
          content_type: contentType,
          ingest_status: ingestStatus,
          chunk_count: chunkCount,
          weaviate_indexed: weaviateIndexed,
        };
      });

      const payload: DocumentsListResponse = { documents };
      response.json(payload);
    }),
  );

  router.delete(
    "/:documentId",
    requireAuth,
    asyncHandler(async (request, response) => {
      const parsedId = z.string().uuid().safeParse(request.params.documentId);
      if (!parsedId.success) {
        response.status(400).json({ error: "Invalid document id" });
        return;
      }

      const authUser = request.authUser;
      if (!authUser) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      if (deps.pipeline) {
        try {
          await deps.pipeline.deleteUserDocument({
            userId: authUser.userId,
            documentId: parsedId.data,
          });
        } catch (error) {
          if (mapPipelineError(error, response)) {
            return;
          }
          console.error("docs delete failed", error);
          response.status(500).json({ error: "Delete failed" });
          return;
        }
        const body: DocsDeleteResponse = {
          deleted: true,
          document_id: parsedId.data,
          storage_cleanup: "full",
        };
        response.json(body);
        return;
      }

      const row = await deps.prisma.document.findUnique({
        where: { docId: parsedId.data },
      });
      if (!row) {
        response.status(404).json({ error: "Document not found" });
        return;
      }
      if (!row.userId || row.userId !== authUser.userId) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }
      await deps.prisma.document.delete({ where: { docId: parsedId.data } });
      const body: DocsDeleteResponse = {
        deleted: true,
        document_id: parsedId.data,
        storage_cleanup: "database_only",
      };
      response.json(body);
    }),
  );

  router.post("/presign", requireAuth, async (request, response) => {
    const parsed = docsPresignBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const authUser = request.authUser;
    if (!authUser) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!deps.pipeline) {
      respondPipelineDisabled(response);
      return;
    }

    try {
      const user = await deps.prisma.user.findUnique({
        where: { userId: authUser.userId },
        select: { orgId: true },
      });

      const created = await deps.pipeline.createPresignedUpload({
        userId: authUser.userId,
        orgId: user?.orgId ?? null,
        fileName: parsed.data.fileName,
        contentType: parsed.data.contentType,
      });

      const payload: DocsPresignResponse = {
        uploadUrl: created.uploadUrl,
        documentId: created.documentId,
        expiresAt: created.expiresAt,
        objectKey: created.objectKey,
      };
      response.json(payload);
    } catch (error) {
      console.error("docs presign failed", error);
      response.status(500).json({ error: "Failed to create upload URL" });
    }
  });

  router.post("/ingest", requireAuth, async (request, response) => {
    const parsed = docsIngestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const authUser = request.authUser;
    if (!authUser) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!deps.pipeline) {
      respondPipelineDisabled(response);
      return;
    }

    try {
      const result = await deps.pipeline.ingestDocument({
        userId: authUser.userId,
        documentId: parsed.data.documentId,
      });

      const payload: DocsIngestResponse = {
        documentId: result.documentId,
        status: result.status,
        chunkCount: result.chunkCount,
      };
      response.json(payload);
    } catch (error) {
      if (mapPipelineError(error, response)) {
        return;
      }
      console.error("docs ingest failed", error);
      response.status(500).json({ error: "Ingest failed" });
    }
  });

  router.post("/query", requireAuth, async (request, response) => {
    const parsed = docsQueryBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const authUser = request.authUser;
    if (!authUser) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (!deps.pipeline) {
      respondPipelineDisabled(response);
      return;
    }

    try {
      const chunks = await deps.pipeline.queryContext({
        userId: authUser.userId,
        query: parsed.data.query,
        limit: parsed.data.limit ?? 8,
      });

      const payload: DocsQueryResponse = { chunks };
      response.json(payload);
    } catch (error) {
      console.error("docs query failed", error);
      response.status(500).json({ error: "Query failed" });
    }
  });

  return router;
}
