import "./env.js";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import express from "express";

import { createAuthRouter } from "./features/auth/auth.routes.js";

const port = Number(process.env.PORT) || 3001;

const prisma = new PrismaClient();

const app = express();
// Permissive for local dev; replace with an explicit origin allowlist before production.
app.use(cors({ origin: true }));
app.use(express.json());

app.get("/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "aimarketplace-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "aimarketplace-api",
    timestamp: new Date().toISOString(),
  });
});

app.use("/api/auth", createAuthRouter(prisma));

async function start(): Promise<void> {
  await prisma.$connect();
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});

process.on("beforeExit", async () => {
  await prisma.$disconnect();
});
