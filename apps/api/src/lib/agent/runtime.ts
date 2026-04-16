import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import type { PrismaClient } from "@prisma/client";

import type { DocumentPipeline } from "../../features/docs/document.pipeline.js";
import { withTimeout } from "../with-timeout.js";

// ---------------------------------------------------------------------------
// LangGraph state annotation
// ---------------------------------------------------------------------------

const lastValue = <T>(fallback: T) => ({
  reducer: (_prev: T, next: T) => next,
  default: () => fallback,
});

const SkillGraphState = Annotation.Root({
  query: Annotation<string>(),
  context: Annotation<string>(lastValue("")),
  output: Annotation<string>(lastValue("")),
  intermediate: Annotation<Record<string, unknown>>(lastValue({})),
  userId: Annotation<string>(),
  departmentId: Annotation<string>(),
  orgScope: Annotation<string>(),
});

/** Backward-compatible type alias — same shape callers already depend on. */
export type AgentState = typeof SkillGraphState.State;

export type RunSkillDeps = {
  prisma: PrismaClient;
  pipeline: DocumentPipeline | null;
  chatModel: ChatOpenAI;
  /** Same scope as nodes/skills in DB (`org_id` column). */
  orgId: string;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYSTEM_RETRIEVE = "retrieve_documents";

/** Built-in final step when a skill has no workflow nodes (skills/nodes are optional). */
const DEFAULT_COMPLETION_NODE = "__default_agent_reply__";

const DEFAULT_AGENT_PROMPT_TEMPLATE = [
  "You are a helpful assistant for an internal AI marketplace.",
  "When document context is provided below, ground your answer in it; do not invent unsupported facts.",
  "If context is empty or irrelevant, answer from general knowledge when appropriate.",
  "",
  "--- Document context (may be empty) ---",
  "{{context}}",
  "",
  "--- User question ---",
  "{{query}}",
  "",
  "Reply concisely.",
].join("\n");

// ---------------------------------------------------------------------------
// Execution-order logic (unchanged from before)
// ---------------------------------------------------------------------------

/**
 * When the document pipeline is enabled, run exactly one vector search before skill nodes.
 * Strips duplicate `retrieve_documents` entries from the skill definition so RAG is not skipped
 * when builders forget to add the system step.
 * If there are no user-defined prompt nodes, appends a built-in completion step so the LLM always runs.
 */
export function buildSkillExecutionOrder(
  pipeline: DocumentPipeline | null,
  skillNodeNames: string[],
): string[] {
  let steps: string[];
  if (!pipeline) {
    steps = [...skillNodeNames];
  } else {
    const withoutRetrieve = skillNodeNames.filter((name) => name !== SYSTEM_RETRIEVE);
    steps = [SYSTEM_RETRIEVE, ...withoutRetrieve];
  }

  const hasUserPrompt = steps.some((name) => !isSystemNodeName(name));
  if (!hasUserPrompt) {
    steps = [...steps, DEFAULT_COMPLETION_NODE];
  }

  return steps;
}

// ---------------------------------------------------------------------------
// Variable injection (unchanged)
// ---------------------------------------------------------------------------

export function injectVariables(template: string, state: AgentState): string {
  const safe = template.replace(/\x00/g, "");
  return safe
    .replaceAll("{{query}}", state.query ?? "")
    .replaceAll("{{context}}", state.context ?? "")
    .replaceAll("{{output}}", typeof state.output === "string" ? state.output : "");
}

// ---------------------------------------------------------------------------
// LangGraph node functions
// ---------------------------------------------------------------------------

function retrieveDocumentsNode(deps: RunSkillDeps) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    const prev = state.intermediate ?? {};
    if (!deps.pipeline) {
      return { context: "", intermediate: { ...prev, [SYSTEM_RETRIEVE]: [] } };
    }

    try {
      const results = await withTimeout(
        deps.pipeline.queryContext({
          departmentId: state.departmentId,
          query: state.query,
          limit: 12,
        }),
        120_000,
        "Document retrieval (embedding + Weaviate)",
      );

      const context = results.map((r) => r.text).join("\n\n");
      return {
        context,
        intermediate: { ...prev, [SYSTEM_RETRIEVE]: results },
      };
    } catch (error) {
      console.error("retrieve_documents failed or timed out", error);
      return {
        context: "",
        intermediate: { ...prev, [SYSTEM_RETRIEVE]: [] },
      };
    }
  };
}

function promptNodeFactory(deps: RunSkillDeps, nodeName: string) {
  return async (state: AgentState): Promise<Partial<AgentState>> => {
    let promptTemplate: string;

    if (nodeName === DEFAULT_COMPLETION_NODE) {
      promptTemplate = DEFAULT_AGENT_PROMPT_TEMPLATE;
    } else {
      const node = await deps.prisma.node.findFirst({
        where: { orgId: deps.orgId, name: nodeName },
      });
      if (!node) {
        throw new Error(`Unknown node: ${nodeName}`);
      }
      promptTemplate = node.promptTemplate;
    }

    let userMessage = injectVariables(promptTemplate, state);
    const contextBlock = (state.context ?? "").trim();
    const templateUsesContext = promptTemplate.includes("{{context}}");
    const prev = state.intermediate ?? {};
    const retrievalRan = Object.prototype.hasOwnProperty.call(prev, SYSTEM_RETRIEVE);

    if (contextBlock.length > 0 && !templateUsesContext) {
      userMessage = `${userMessage}\n\n--- Retrieved document excerpts ---\n${contextBlock}`;
    } else if (contextBlock.length === 0 && retrievalRan) {
      userMessage = `${userMessage}\n\n(No matching indexed document excerpts were found for this question.)`;
    }

    const response = await callLlm(deps.chatModel, userMessage);
    return {
      output: response,
      intermediate: { ...prev, [nodeName]: response },
    };
  };
}

// ---------------------------------------------------------------------------
// LLM call helpers (unchanged)
// ---------------------------------------------------------------------------

function aiMessageContentToString(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("");
  }
  return "";
}

async function callLlm(chatModel: ChatOpenAI, prompt: string): Promise<string> {
  const message = await withTimeout(
    chatModel.invoke([new HumanMessage(prompt)]),
    120_000,
    "LLM completion",
  );
  return aiMessageContentToString(message.content).trim();
}

// ---------------------------------------------------------------------------
// Graph compilation + execution
// ---------------------------------------------------------------------------

function compileSkillGraph(deps: RunSkillDeps, skillNodeNames: string[]) {
  const order = buildSkillExecutionOrder(deps.pipeline, skillNodeNames);
  const graph = new StateGraph(SkillGraphState);

  for (const stepName of order) {
    if (stepName === SYSTEM_RETRIEVE) {
      graph.addNode(stepName, retrieveDocumentsNode(deps));
    } else {
      graph.addNode(stepName, promptNodeFactory(deps, stepName));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- node names are dynamic strings
  const addEdge = (a: string, b: string) => graph.addEdge(a as any, b as any);

  addEdge(START, order[0]!);
  for (let i = 0; i < order.length - 1; i++) {
    addEdge(order[i]!, order[i + 1]!);
  }
  addEdge(order[order.length - 1]!, END);

  return graph.compile();
}

export async function runSkill(
  deps: RunSkillDeps,
  skillNodeNames: string[],
  initial: Pick<AgentState, "query" | "userId" | "departmentId" | "orgScope">,
): Promise<AgentState> {
  const compiled = compileSkillGraph(deps, skillNodeNames);
  const result = await compiled.invoke({
    query: initial.query,
    userId: initial.userId,
    departmentId: initial.departmentId,
    orgScope: initial.orgScope,
  });
  return result as AgentState;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

export function isSystemNodeName(name: string): boolean {
  return name === SYSTEM_RETRIEVE || name === DEFAULT_COMPLETION_NODE;
}
