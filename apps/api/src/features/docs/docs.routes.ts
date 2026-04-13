import { randomUUID } from "node:crypto";

import { Router } from "express";

import {
  docsIngestBodySchema,
  type DocsIngestResponse,
  docsPresignBodySchema,
  type DocsPresignResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";

export function createDocsRouter(): Router {
  const router = Router();

  router.post("/presign", requireAuth, (request, response) => {
    const parsed = docsPresignBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 15 * 60 * 1000);
    const payload: DocsPresignResponse = {
      uploadUrl: `https://example.invalid/mock-upload/${parsed.data.fileName}`,
      documentId: randomUUID(),
      expiresAt: expires.toISOString(),
    };
    response.json(payload);
  });

  router.post("/ingest", requireAuth, (request, response) => {
    const parsed = docsIngestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload: DocsIngestResponse = {
      documentId: parsed.data.documentId,
      status: "queued",
    };
    response.status(202).json(payload);
  });

  return router;
}
