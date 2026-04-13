import { randomUUID } from "node:crypto";

import { Router } from "express";

import {
  skillCreateBodySchema,
  type SkillCreateResponse,
  skillInstallBodySchema,
  type SkillInstallResponse,
  type SkillsListResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";

export function createSkillsRouter(): Router {
  const router = Router();

  router.get("/", (_request, response) => {
    const payload: SkillsListResponse = { skills: [] };
    response.json(payload);
  });

  router.post("/create", requireAuth, (request, response) => {
    const parsed = skillCreateBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload: SkillCreateResponse = {
      skill_id: randomUUID(),
      name: parsed.data.name,
      version: 1,
    };
    response.status(201).json(payload);
  });

  router.post("/install", requireAuth, (request, response) => {
    const parsed = skillInstallBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const payload: SkillInstallResponse = {
      installed: true,
      skill_id: parsed.data.skill_id,
    };
    response.status(201).json(payload);
  });

  return router;
}
