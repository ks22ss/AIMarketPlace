import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type OpenAI from "openai";

import type { DocumentPipeline } from "../docs/document.pipeline.js";
import { RAG_QA_SKILL_ID } from "./skills/rag-qa.skill.js";
import { createRetrieverTool } from "./tools/retriever.tool.js";

const AgentState = Annotation.Root({
  userMessage: Annotation<string>(),
  userId: Annotation<string>(),
  /** Set by the planner node (single skill in Phase 3). */
  plannedSkill: Annotation<string>(),
  retrievalContext: Annotation<string>(),
  reply: Annotation<string>(),
});

export type RagAgentState = typeof AgentState.State;

/**
 * Minimal LangGraph: plan → retrieve (tool) → answer.
 * Planner is deterministic (always selects RAG QA); future phases can swap this for an LLM router.
 */
export function compileRagAgentGraph(
  pipeline: DocumentPipeline,
  openai: OpenAI,
  model: string,
  temperature: number,
) {
  const retrieverTool = createRetrieverTool(pipeline);

  async function planNode(): Promise<Partial<RagAgentState>> {
    return { plannedSkill: RAG_QA_SKILL_ID };
  }

  async function retrieveNode(state: RagAgentState): Promise<Partial<RagAgentState>> {
    const text = await retrieverTool.invoke(
      { query: state.userMessage },
      { configurable: { userId: state.userId } },
    );
    return { retrievalContext: String(text) };
  }

  async function answerNode(state: RagAgentState): Promise<Partial<RagAgentState>> {
    const system = [
      "You are a concise assistant for an internal document marketplace.",
      "Use only the provided context when it is relevant. If the context does not contain the answer, say so.",
      "Do not invent document content. Prefer short answers.",
      "",
      "Context from document retrieval:",
      state.retrievalContext || "(none)",
    ].join("\n");

    const completion = await openai.chat.completions.create({
      model,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: state.userMessage },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "";
    return { reply: content.trim() || "(empty model response)" };
  }

  return new StateGraph(AgentState)
    .addNode("plan", planNode)
    .addNode("retrieve", retrieveNode)
    .addNode("answer", answerNode)
    .addEdge(START, "plan")
    .addEdge("plan", "retrieve")
    .addEdge("retrieve", "answer")
    .addEdge("answer", END)
    .compile();
}

export type CompiledRagAgentGraph = ReturnType<typeof compileRagAgentGraph>;
