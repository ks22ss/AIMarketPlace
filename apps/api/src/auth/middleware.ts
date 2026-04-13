import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "./jwt.js";

export function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    response.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    response.status(401).json({ error: "Missing token" });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    request.authUser = { userId: payload.sub, email: payload.email };
    next();
  } catch {
    response.status(401).json({ error: "Invalid or expired token" });
  }
}
