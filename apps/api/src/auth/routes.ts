import bcrypt from "bcryptjs";
import { Router, type Request, type Response } from "express";
import type { Pool } from "pg";

import { requireAuth } from "./middleware.js";
import { signAccessToken } from "./jwt.js";
import { loginBodySchema, registerBodySchema } from "./schemas.js";

const saltRounds = 12;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type PublicUser = {
  userId: string;
  email: string;
  role: string;
  department: string | null;
  orgId: string | null;
  createdAt: string;
};

function mapUserRow(row: {
  user_id: string;
  email: string;
  role: string;
  department: string | null;
  org_id: string | null;
  created_at: Date;
}): PublicUser {
  return {
    userId: row.user_id,
    email: row.email,
    role: row.role,
    department: row.department,
    orgId: row.org_id,
    createdAt: row.created_at.toISOString(),
  };
}

export function createAuthRouter(databasePool: Pool): Router {
  const router = Router();

  router.post("/register", async (request: Request, response: Response) => {
    const parsed = registerBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const email = normalizeEmail(parsed.data.email);
    const password = parsed.data.password;

    try {
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const insertResult = await databasePool.query<{
        user_id: string;
        email: string;
        role: string;
        department: string | null;
        org_id: string | null;
        created_at: Date;
      }>(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, 'member')
         RETURNING user_id, email, role, department, org_id, created_at`,
        [email, passwordHash],
      );

      const row = insertResult.rows[0];
      if (!row) {
        response.status(500).json({ error: "Failed to create user" });
        return;
      }

      const user = mapUserRow(row);
      const accessToken = signAccessToken({ sub: user.userId, email: user.email });
      response.status(201).json({ accessToken, user });
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        response.status(409).json({ error: "Email is already registered" });
        return;
      }
      console.error("register error", error);
      response.status(500).json({ error: "Registration failed" });
    }
  });

  router.post("/login", async (request: Request, response: Response) => {
    const parsed = loginBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    const email = normalizeEmail(parsed.data.email);
    const password = parsed.data.password;

    try {
      const userResult = await databasePool.query<{
        user_id: string;
        email: string;
        role: string;
        department: string | null;
        org_id: string | null;
        created_at: Date;
        password_hash: string;
      }>(
        `SELECT user_id, email, role, department, org_id, created_at, password_hash
         FROM users WHERE email = $1`,
        [email],
      );

      const row = userResult.rows[0];
      if (!row) {
        response.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const passwordMatches = await bcrypt.compare(password, row.password_hash);
      if (!passwordMatches) {
        response.status(401).json({ error: "Invalid email or password" });
        return;
      }

      const user = mapUserRow({
        user_id: row.user_id,
        email: row.email,
        role: row.role,
        department: row.department,
        org_id: row.org_id,
        created_at: row.created_at,
      });
      const accessToken = signAccessToken({ sub: user.userId, email: user.email });
      response.json({ accessToken, user });
    } catch (error) {
      console.error("login error", error);
      response.status(500).json({ error: "Login failed" });
    }
  });

  router.get("/me", requireAuth, async (request: Request, response: Response) => {
    const authUser = request.authUser;
    if (!authUser) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const userResult = await databasePool.query<{
        user_id: string;
        email: string;
        role: string;
        department: string | null;
        org_id: string | null;
        created_at: Date;
      }>(
        `SELECT user_id, email, role, department, org_id, created_at
         FROM users WHERE user_id = $1`,
        [authUser.userId],
      );

      const row = userResult.rows[0];
      if (!row) {
        response.status(401).json({ error: "User not found" });
        return;
      }

      response.json({ user: mapUserRow(row) });
    } catch (error) {
      console.error("me error", error);
      response.status(500).json({ error: "Failed to load profile" });
    }
  });

  return router;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}
