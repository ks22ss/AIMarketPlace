import { randomUUID } from "node:crypto";

import { Router } from "express";

import {
  chatPostBodySchema,
  type ChatPostResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";

export function createChatRouter(): Router {
  const router = Router();

  router.post("/", requireAuth, (request, response) => {
    const parsed = chatPostBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload: ChatPostResponse = {
      reply: `[mock] ${parsed.data.message.slice(0, 500)}`,
      traceId: randomUUID(),
    };
    response.json(payload);
  });

  return router;
}
