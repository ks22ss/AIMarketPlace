import { randomUUID } from "node:crypto";

import { Router } from "express";

import {
  chatPostBodySchema,
  type ChatPostResponse,
} from "../../contracts/public-api.js";
import { requireAuth } from "../auth/auth.middleware.js";
import type { CompiledRagAgentGraph } from "./rag-agent.graph.js";

export type ChatRouterDeps = {
  ragGraph: CompiledRagAgentGraph | null;
};

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();

  router.post("/", requireAuth, async (request, response) => {
    const parsed = chatPostBodySchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        error: "Invalid request body",
        details: parsed.error.flatten(),
      });
      return;
    }

    if (!deps.ragGraph) {
      response.status(503).json({
        error: "RAG chat is not configured",
        detail:
          "Requires an active document pipeline (embeddings + Weaviate + S3) and chat credentials: " +
          "CHAT_API_KEY or OPENAI_API_KEY / DEEPINFRA_TOKEN, plus LLM_MODEL and CHAT_BASE_URL or OPENAI_BASE_URL as needed.",
      });
      return;
    }

    const authUser = request.authUser;
    if (!authUser) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    const traceId = randomUUID();

    try {
      const finalState = await deps.ragGraph.invoke(
        {
          userMessage: parsed.data.message,
          userId: authUser.userId,
          plannedSkill: "",
          retrievalContext: "",
          reply: "",
        },
        { configurable: { userId: authUser.userId } },
      );

      const payload: ChatPostResponse = {
        reply: finalState.reply,
        traceId,
      };
      response.json(payload);
    } catch (error) {
      console.error("chat RAG agent failed", error);
      response.status(500).json({
        error: "Chat failed",
        traceId,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
