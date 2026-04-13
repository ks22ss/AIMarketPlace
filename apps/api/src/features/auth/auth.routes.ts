import { Router } from "express";
import type { Pool } from "pg";

import { createAuthController } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";
import { createAuthRepository } from "./auth.repository.js";
import { createAuthService } from "./auth.service.js";

export function createAuthRouter(databasePool: Pool): Router {
  const router = Router();
  const repository = createAuthRepository(databasePool);
  const service = createAuthService(repository);
  const controller = createAuthController(service);

  router.post("/register", (request, response) => {
    void controller.register(request, response);
  });
  router.post("/login", (request, response) => {
    void controller.login(request, response);
  });
  router.get("/me", requireAuth, (request, response) => {
    void controller.me(request, response);
  });

  return router;
}
