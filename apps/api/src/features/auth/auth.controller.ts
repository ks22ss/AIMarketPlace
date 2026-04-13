import type { Request, Response } from "express";

import {
  loginBodySchema,
  registerBodySchema,
} from "./auth.dto.js";
import type { AuthService } from "./auth.service.js";

export function createAuthController(service: AuthService) {
  async function register(request: Request, response: Response): Promise<void> {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const outcome = await service.register(parsed.data);
    if (outcome.kind === "success") {
      response.status(201).json(outcome.data);
      return;
    }
    if (outcome.kind === "email_exists") {
      response.status(409).json({ error: "Email is already registered" });
      return;
    }
    response.status(500).json({ error: "Registration failed" });
  }

  async function login(request: Request, response: Response): Promise<void> {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const outcome = await service.login(parsed.data);
    if (outcome.kind === "success") {
      response.json(outcome.data);
      return;
    }
    if (outcome.kind === "invalid_credentials") {
      response.status(401).json({ error: "Invalid email or password" });
      return;
    }
    response.status(500).json({ error: "Login failed" });
  }

  async function me(request: Request, response: Response): Promise<void> {
    const authUser = request.authUser;
    if (!authUser) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const user = await service.getProfileByUserId(authUser.userId);
      if (!user) {
        response.status(401).json({ error: "User not found" });
        return;
      }
      response.json({ user });
    } catch (error) {
      console.error("me error", error);
      response.status(500).json({ error: "Failed to load profile" });
    }
  }

  return { register, login, me };
}

export type AuthController = ReturnType<typeof createAuthController>;
