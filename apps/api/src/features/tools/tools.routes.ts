import { randomUUID } from "node:crypto";

import { Router } from "express";

import {
  toolRegisterBodySchema,
  type ToolRegisterResponse,
  type ToolsListResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";

export function createToolsRouter(): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    const payload: ToolsListResponse = { tools: [] };
    response.json(payload);
  });

  router.post("/register", requireAuth, (request, response) => {
    const parsed = toolRegisterBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload: ToolRegisterResponse = {
      tool_id: randomUUID(),
      name: parsed.data.name,
      type: parsed.data.type,
    };
    response.status(201).json(payload);
  });

  return router;
}
