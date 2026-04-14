import type { ChatOpenAI } from "@langchain/openai";
import { HumanMessage } from "@langchain/core/messages";
import type { PrismaClient } from "@prisma/client";

import type { DocumentPipeline } from "../../features/docs/document.pipeline.js";

export type AgentState = {
  query: string;
  context?: string;
  output?: string;
  intermediate: Record<string, unknown>;
  userId: string;
  departmentId: string;
  /** UUID string used for node/skill tenancy (user.orgId ?? user.userId). */
  orgScope: string;
};

export type RunSkillDeps = {
  prisma: PrismaClient;
  pipeline: DocumentPipeline | null;
  chatModel: ChatOpenAI;
  /** Same scope as nodes/skills in DB (`org_id` column). */
  orgId: string;
};

const SYSTEM_RETRIEVE = "retrieve_documents";

/**
 * When the document pipeline is enabled, run exactly one vector search before prompt nodes.
 * Strips duplicate `retrieve_documents` entries from the skill definition so RAG is not skipped
 * when builders forget to add the system step.
 */
export function buildSkillExecutionOrder(
  pipeline: DocumentPipeline | null,
  skillNodeNames: string[],
): string[] {
  if (!pipeline) {
    return skillNodeNames;
  }
  const withoutRetrieve = skillNodeNames.filter((name) => name !== SYSTEM_RETRIEVE);
  return [SYSTEM_RETRIEVE, ...withoutRetrieve];
}

export function injectVariables(template: string, state: AgentState): string {
  const safe = template.replace(/\x00/g, "");
  return safe
    .replaceAll("{{query}}", state.query ?? "")
    .replaceAll("{{context}}", state.context ?? "")
    .replaceAll("{{output}}", typeof state.output === "string" ? state.output : "");
}

export async function runSkill(
  deps: RunSkillDeps,
  skillNodeNames: string[],
  initial: Pick<AgentState, "query" | "userId" | "departmentId" | "orgScope">,
): Promise<AgentState> {
  let state: AgentState = {
    query: initial.query,
    userId: initial.userId,
    departmentId: initial.departmentId,
    orgScope: initial.orgScope,
    intermediate: {},
  };
  const order = buildSkillExecutionOrder(deps.pipeline, skillNodeNames);
  for (const nodeName of order) {
    console.log(`Executing node: ${nodeName}`);
    state = await executeNode(deps, nodeName, state);
  }
  return state;
}

async function executeNode(deps: RunSkillDeps, nodeName: string, state: AgentState): Promise<AgentState> {
  if (nodeName === SYSTEM_RETRIEVE) {
    return retrieveDocuments(deps, state);
  }

  const node = await deps.prisma.node.findFirst({
    where: { orgId: deps.orgId, name: nodeName },
  });
  if (!node) {
    throw new Error(`Unknown node: ${nodeName}`);
  }

  return runPromptNode(deps, node, state);
}

async function retrieveDocuments(deps: RunSkillDeps, state: AgentState): Promise<AgentState> {
  if (!deps.pipeline) {
    return { ...state, context: "" };
  }

  const results = await deps.pipeline.queryContext({
    departmentId: state.departmentId,
    query: state.query,
    limit: 12,
  });

  const context = results.map((r) => r.text).join("\n\n");
  return {
    ...state,
    context,
    intermediate: { ...state.intermediate, [SYSTEM_RETRIEVE]: results },
  };
}

async function runPromptNode(
  deps: RunSkillDeps,
  node: { name: string; promptTemplate: string },
  state: AgentState,
): Promise<AgentState> {
  let userMessage = injectVariables(node.promptTemplate, state);
  const contextBlock = (state.context ?? "").trim();
  const templateUsesContext = node.promptTemplate.includes("{{context}}");
  const retrievalRan = Object.prototype.hasOwnProperty.call(state.intermediate, SYSTEM_RETRIEVE);

  if (contextBlock.length > 0 && !templateUsesContext) {
    userMessage = `${userMessage}\n\n--- Retrieved document excerpts ---\n${contextBlock}`;
  } else if (contextBlock.length === 0 && retrievalRan) {
    userMessage = `${userMessage}\n\n(No matching indexed document excerpts were found for this question.)`;
  }

  const response = await callLlm(deps.chatModel, userMessage);
  return {
    ...state,
    output: response,
    intermediate: { ...state.intermediate, [node.name]: response },
  };
}

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
  const message = await chatModel.invoke([new HumanMessage(prompt)]);
  return aiMessageContentToString(message.content).trim();
}

export function isSystemNodeName(name: string): boolean {
  return name === SYSTEM_RETRIEVE;
}
