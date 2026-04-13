import { Router } from "express";

import {
  configLlmPutBodySchema,
  type ConfigLlmPutResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";

export function createConfigRouter(): Router {
  const router = Router();

  router.put("/llm", requireAuth, (request, response) => {
    const parsed = configLlmPutBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload: ConfigLlmPutResponse = {
      model: parsed.data.model,
      temperature: parsed.data.temperature,
      updatedAt: new Date().toISOString(),
    };
    response.json(payload);
  });

  return router;
}
