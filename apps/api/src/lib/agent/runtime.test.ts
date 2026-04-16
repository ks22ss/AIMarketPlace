import { describe, expect, it, vi } from "vitest";

import type { DocumentPipeline } from "../../features/docs/document.pipeline.js";
import { isValidNodeName } from "./node-naming.js";
import {
  buildSkillExecutionOrder,
  injectVariables,
  runSkill,
  type AgentState,
  type RunSkillDeps,
} from "./runtime.js";

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    query: "q",
    context: "",
    output: "",
    userId: "u1",
    departmentId: "b0000001-0000-4000-8000-000000000001",
    orgScope: "o1",
    intermediate: {},
    ...overrides,
  };
}

describe("isValidNodeName", () => {
  it("accepts snake_case", () => {
    expect(isValidNodeName("summarize")).toBe(true);
    expect(isValidNodeName("retrieve_documents")).toBe(true);
    expect(isValidNodeName("step_2")).toBe(true);
  });

  it("rejects invalid shapes", () => {
    expect(isValidNodeName("BadCase")).toBe(false);
    expect(isValidNodeName("no spaces")).toBe(false);
    expect(isValidNodeName("")).toBe(false);
  });
});

const defaultReply = "__default_agent_reply__";

describe("buildSkillExecutionOrder", () => {
  it("returns original order when pipeline is unavailable", () => {
    expect(buildSkillExecutionOrder(null, ["summarize"])).toEqual(["summarize"]);
    expect(buildSkillExecutionOrder(null, ["retrieve_documents", "summarize"])).toEqual([
      "retrieve_documents",
      "summarize",
    ]);
  });

  it("appends built-in completion when there are no user prompt nodes", () => {
    expect(buildSkillExecutionOrder(null, [])).toEqual([defaultReply]);
    expect(buildSkillExecutionOrder(null, ["retrieve_documents"])).toEqual([
      "retrieve_documents",
      defaultReply,
    ]);
    const pipeline = {} as DocumentPipeline;
    expect(buildSkillExecutionOrder(pipeline, [])).toEqual(["retrieve_documents", defaultReply]);
    expect(buildSkillExecutionOrder(pipeline, ["retrieve_documents"])).toEqual([
      "retrieve_documents",
      defaultReply,
    ]);
  });

  it("prepends a single retrieve step and removes duplicates when pipeline exists", () => {
    const pipeline = {} as DocumentPipeline;
    expect(buildSkillExecutionOrder(pipeline, ["summarize"])).toEqual(["retrieve_documents", "summarize"]);
    expect(buildSkillExecutionOrder(pipeline, ["retrieve_documents", "summarize"])).toEqual([
      "retrieve_documents",
      "summarize",
    ]);
    expect(buildSkillExecutionOrder(pipeline, ["summarize", "retrieve_documents"])).toEqual([
      "retrieve_documents",
      "summarize",
    ]);
  });
});

describe("injectVariables", () => {
  it("replaces query context and output placeholders", () => {
    const state = baseState({
      query: "Explain",
      context: "CTX",
      output: "OUT",
    });
    const result = injectVariables("{{query}} | {{context}} | {{output}}", state);
    expect(result).toBe("Explain | CTX | OUT");
  });

  it("strips null bytes from template", () => {
    const state = baseState();
    const result = injectVariables("x\x00y{{query}}", state);
    expect(result).toBe("xyq");
  });
});

// ---------------------------------------------------------------------------
// runSkill — LangGraph integration tests (mocked deps)
// ---------------------------------------------------------------------------

function makeMockChatModel(reply: string) {
  return {
    invoke: vi.fn().mockResolvedValue({ content: reply }),
  } as unknown as RunSkillDeps["chatModel"];
}

function makeMockPrisma(nodes: Record<string, string> = {}) {
  return {
    node: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: { orgId: string; name: string } }) => {
        const template = nodes[where.name];
        if (!template) return Promise.resolve(null);
        return Promise.resolve({ name: where.name, promptTemplate: template });
      }),
    },
  } as unknown as RunSkillDeps["prisma"];
}

function makeMockPipeline(chunks: Array<{ text: string; doc_id: string; chunk_index: number; score: number }> = []) {
  return {
    queryContext: vi.fn().mockResolvedValue(chunks),
  } as unknown as DocumentPipeline;
}

describe("runSkill (LangGraph)", () => {
  it("runs default completion when no skill nodes are provided", async () => {
    const chatModel = makeMockChatModel("Hello from LLM");
    const deps: RunSkillDeps = {
      prisma: makeMockPrisma(),
      pipeline: null,
      chatModel,
      orgId: "org1",
    };

    const result = await runSkill(deps, [], {
      query: "hi",
      userId: "u1",
      departmentId: "d1",
      orgScope: "org1",
    });

    expect(result.output).toBe("Hello from LLM");
    expect(chatModel.invoke).toHaveBeenCalledTimes(1);
  });

  it("runs retrieval then a user prompt node when pipeline is available", async () => {
    const chatModel = makeMockChatModel("summarized answer");
    const pipeline = makeMockPipeline([
      { text: "chunk1 text", doc_id: "doc1", chunk_index: 0, score: 0.1 },
    ]);
    const prisma = makeMockPrisma({
      summarize: "Summarize: {{context}}\nQuestion: {{query}}",
    });
    const deps: RunSkillDeps = { prisma, pipeline, chatModel, orgId: "org1" };

    const result = await runSkill(deps, ["summarize"], {
      query: "what is this?",
      userId: "u1",
      departmentId: "d1",
      orgScope: "org1",
    });

    expect(pipeline.queryContext).toHaveBeenCalledOnce();
    expect(result.context).toBe("chunk1 text");
    expect(result.output).toBe("summarized answer");
    expect(result.intermediate).toHaveProperty("retrieve_documents");
    expect(result.intermediate).toHaveProperty("summarize", "summarized answer");
  });

  it("degrades gracefully when retrieval fails", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const chatModel = makeMockChatModel("fallback answer");
      const pipeline = {
        queryContext: vi.fn().mockRejectedValue(new Error("Weaviate timeout")),
      } as unknown as DocumentPipeline;
      const prisma = makeMockPrisma({ summarize: "{{query}}" });
      const deps: RunSkillDeps = { prisma, pipeline, chatModel, orgId: "org1" };

      const result = await runSkill(deps, ["summarize"], {
        query: "test",
        userId: "u1",
        departmentId: "d1",
        orgScope: "org1",
      });

      expect(result.context).toBe("");
      expect(result.output).toBe("fallback answer");
      expect(result.intermediate).toHaveProperty("retrieve_documents");
    } finally {
      errSpy.mockRestore();
    }
  });

  it("does not mark retrieval as ran when pipeline is disabled but skill lists retrieve_documents", async () => {
    const chatModel = makeMockChatModel("ok");
    const deps: RunSkillDeps = {
      prisma: makeMockPrisma(),
      pipeline: null,
      chatModel,
      orgId: "org1",
    };

    const result = await runSkill(deps, ["retrieve_documents"], {
      query: "hello",
      userId: "u1",
      departmentId: "d1",
      orgScope: "org1",
    });

    expect(result.intermediate).not.toHaveProperty("retrieve_documents");
    expect(chatModel.invoke).toHaveBeenCalledTimes(1);
    const prompt = (chatModel.invoke as ReturnType<typeof vi.fn>).mock.calls[0][0][0].content as string;
    expect(prompt).not.toMatch(/No matching indexed document excerpts/);
  });

  it("executes multiple prompt nodes in order", async () => {
    const callOrder: string[] = [];
    const chatModel = {
      invoke: vi.fn().mockImplementation((messages: unknown[]) => {
        const msg = messages[0] as { content: string };
        callOrder.push(msg.content.slice(0, 20));
        return Promise.resolve({ content: `reply-${callOrder.length}` });
      }),
    } as unknown as RunSkillDeps["chatModel"];

    const prisma = makeMockPrisma({
      step_one: "Step1: {{query}}",
      step_two: "Step2: {{output}}",
    });
    const deps: RunSkillDeps = { prisma, pipeline: null, chatModel, orgId: "org1" };

    const result = await runSkill(deps, ["step_one", "step_two"], {
      query: "test",
      userId: "u1",
      departmentId: "d1",
      orgScope: "org1",
    });

    expect(chatModel.invoke).toHaveBeenCalledTimes(2);
    expect(result.intermediate).toHaveProperty("step_one", "reply-1");
    expect(result.intermediate).toHaveProperty("step_two", "reply-2");
    expect(result.output).toBe("reply-2");
  });
});
