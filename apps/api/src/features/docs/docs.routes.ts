import type { PrismaClient } from "@prisma/client";
import { Router } from "express";

import {
  docsIngestBodySchema,
  type DocsIngestResponse,
  docsPresignBodySchema,
  type DocsPresignResponse,
  docsQueryBodySchema,
  type DocsQueryResponse,
} from "../../contracts/public-api.js";
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
