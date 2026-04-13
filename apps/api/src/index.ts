import "./env.js";
import cors from "cors";
import express from "express";

import { createAuthRouter } from "./auth/routes.js";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";

const port = Number(process.env.PORT) || 3001;

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

app.use("/api/auth", createAuthRouter(pool));

async function start(): Promise<void> {
  await runMigrations(pool);
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start API", error);
  process.exit(1);
});
