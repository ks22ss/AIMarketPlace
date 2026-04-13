import type { PrismaClient } from "@prisma/client";
import { Router } from "express";

import { createAuthController } from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";
import { createAuthRepository } from "./auth.repository.js";
import { createAuthService } from "./auth.service.js";

export function createAuthRouter(prisma: PrismaClient): Router {
  const router = Router();
  const repository = createAuthRepository(prisma);
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
