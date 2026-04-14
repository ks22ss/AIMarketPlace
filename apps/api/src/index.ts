import "./env.js";
import { PrismaClient } from "@prisma/client";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";

import { createAuthRouter } from "./features/auth/auth.routes.js";
import { createChatClientFromEnv, getChatModelId, getChatTemperature } from "./features/chat/chat-llm.js";
import { createChatRouter } from "./features/chat/chat.routes.js";
import { createConfigRouter } from "./features/config/config.routes.js";
import { createDocumentPipelineFromEnv } from "./features/docs/docs.factory.js";
import { createDocsRouter } from "./features/docs/docs.routes.js";
import { createMarketplaceRouter } from "./features/marketplace/marketplace.routes.js";
import { createNodesRouter } from "./features/nodes/nodes.routes.js";
import { createReferenceRouter } from "./features/reference/reference.routes.js";
import { createSkillsRouter } from "./features/skills/skills.routes.js";
import { createToolsRouter } from "./features/tools/tools.routes.js";

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
app.use("/api/reference", createReferenceRouter(prisma));
app.use("/api/nodes", createNodesRouter(prisma));
app.use("/api/skills", createSkillsRouter(prisma));
app.use("/api/marketplace", createMarketplaceRouter(prisma));
app.use("/api/tools", createToolsRouter());
app.use("/api/config", createConfigRouter());

async function start(): Promise<void> {
  await prisma.$connect();

  let documentPipeline: ReturnType<typeof createDocumentPipelineFromEnv> | null = null;
  try {
    documentPipeline = createDocumentPipelineFromEnv(prisma);
    await documentPipeline.bootstrapInfrastructure();
    console.log("Document pipeline: ready (S3 + Weaviate bootstrap OK).");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      "Document pipeline disabled — API will start without /api/docs embeddings. Reason:",
      message,
    );
  }

  app.use("/api/docs", createDocsRouter({ prisma, pipeline: documentPipeline }));

  const chatClient = createChatClientFromEnv();
  if (chatClient) {
    console.log("Skill runtime chat: ready (linear nodes + optional retrieve_documents).");
  } else {
    console.warn(
      "Chat disabled — set CHAT_API_KEY or OPENAI_API_KEY (and model / base URL) for composable skill execution.",
    );
  }

  app.use(
    "/api/chat",
    createChatRouter({
      prisma,
      pipeline: documentPipeline,
      chatClient,
      model: getChatModelId(),
      temperature: getChatTemperature(),
    }),
  );

  app.use(
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      console.error(error);
      const isProduction = process.env.NODE_ENV === "production";
      if (isProduction) {
        response.status(500).json({ error: "Internal server error" });
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      response.status(500).json({ error: "Internal server error", detail });
    },
  );

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
