import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DocumentPipeline } from "../../features/docs/document.pipeline.js";
import { isValidNodeName } from "./node-naming.js";
import {
  buildSkillExecutionOrder,
  getSkillGraphCacheSizeForTests,
  injectVariables,
  resetSkillGraphCacheForTests,
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
  beforeEach(() => {
    resetSkillGraphCacheForTests();
  });

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

  it("streams only the final prompt step when onFinalLlmToken is set", async () => {
    const deltas: string[] = [];
    const chatModel = {
      invoke: vi.fn().mockResolvedValue({ content: "first-out" }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { content: "fi" };
        yield { content: "nal" };
      }),
    } as unknown as RunSkillDeps["chatModel"];

    const prisma = makeMockPrisma({
      step_one: "{{query}}",
      step_two: "{{output}}",
    });
    const deps: RunSkillDeps = {
      prisma,
      pipeline: null,
      chatModel,
      orgId: "org1",
      onFinalLlmToken: (d) => deltas.push(d),
    };

    const result = await runSkill(deps, ["step_one", "step_two"], {
      query: "test",
      userId: "u1",
      departmentId: "d1",
      orgScope: "org1",
    });

    expect(chatModel.invoke).toHaveBeenCalledTimes(1);
    expect(chatModel.stream).toHaveBeenCalledTimes(1);
    expect(deltas.join("")).toBe("final");
    expect(result.intermediate).toHaveProperty("step_one", "first-out");
    expect(result.output).toBe("final");
  });

  it("streams a single default completion via onFinalLlmToken", async () => {
    const deltas: string[] = [];
    const chatModel = {
      invoke: vi.fn(),
      stream: vi.fn().mockImplementation(async function* () {
        yield { content: "Hel" };
        yield { content: "lo" };
      }),
    } as unknown as RunSkillDeps["chatModel"];

    const deps: RunSkillDeps = {
      prisma: makeMockPrisma(),
      pipeline: null,
      chatModel,
      orgId: "org1",
      onFinalLlmToken: (d) => deltas.push(d),
    };

    const result = await runSkill(deps, [], {
      query: "hi",
      userId: "u1",
      departmentId: "d1",
      orgScope: "org1",
    });

    expect(chatModel.invoke).not.toHaveBeenCalled();
    expect(chatModel.stream).toHaveBeenCalledTimes(1);
    expect(deltas.join("")).toBe("Hello");
    expect(result.output).toBe("Hello");
  });
});

describe("runSkill graph cache", () => {
  beforeEach(() => {
    resetSkillGraphCacheForTests();
  });

  it("reuses one compiled graph for repeated identical skill shapes", async () => {
    const chatModel = makeMockChatModel("out");
    const deps: RunSkillDeps = {
      prisma: makeMockPrisma({ my_node: "{{query}}" }),
      pipeline: null,
      chatModel,
      orgId: "org1",
    };
    const initial = {
      query: "a",
      userId: "u1",
      departmentId: "b0000001-0000-4000-8000-000000000001",
      orgScope: "org1",
    };

    expect(getSkillGraphCacheSizeForTests()).toBe(0);
    await runSkill(deps, ["my_node"], initial);
    expect(getSkillGraphCacheSizeForTests()).toBe(1);
    await runSkill(deps, ["my_node"], { ...initial, query: "b" });
    expect(getSkillGraphCacheSizeForTests()).toBe(1);
  });

  it("does not conflate different node orderings", async () => {
    const chatModel = makeMockChatModel("x");
    const prisma = makeMockPrisma({
      step_one: "{{query}}",
      step_two: "{{query}}",
    });
    const deps: RunSkillDeps = { prisma, pipeline: null, chatModel, orgId: "org1" };
    const initial = {
      query: "q",
      userId: "u1",
      departmentId: "b0000001-0000-4000-8000-000000000001",
      orgScope: "org1",
    };

    await runSkill(deps, ["step_one", "step_two"], initial);
    expect(getSkillGraphCacheSizeForTests()).toBe(1);
    await runSkill(deps, ["step_two", "step_one"], initial);
    expect(getSkillGraphCacheSizeForTests()).toBe(2);
  });

  it("uses separate cache entries when pipeline is on vs off", async () => {
    const chatModel = makeMockChatModel("r");
    const prisma = makeMockPrisma({ n: "{{query}}" });
    const initial = {
      query: "q",
      userId: "u1",
      departmentId: "b0000001-0000-4000-8000-000000000001",
      orgScope: "org1",
    };

    await runSkill({ prisma, pipeline: null, chatModel, orgId: "org1" }, ["n"], initial);
    await runSkill({ prisma, pipeline: makeMockPipeline([]), chatModel, orgId: "org1" }, ["n"], initial);
    expect(getSkillGraphCacheSizeForTests()).toBe(2);
  });

  it("uses separate cache entries for buffered vs streaming final step", async () => {
    const chatModel = {
      invoke: vi.fn().mockResolvedValue({ content: "x" }),
      stream: vi.fn().mockImplementation(async function* () {
        yield { content: "x" };
      }),
    } as unknown as RunSkillDeps["chatModel"];
    const prisma = makeMockPrisma({ n: "{{query}}" });
    const initial = {
      query: "q",
      userId: "u1",
      departmentId: "b0000001-0000-4000-8000-000000000001",
      orgScope: "org1",
    };

    await runSkill({ prisma, pipeline: null, chatModel, orgId: "org1" }, ["n"], initial);
    await runSkill(
      { prisma, pipeline: null, chatModel, orgId: "org1", onFinalLlmToken: () => {} },
      ["n"],
      initial,
    );
    expect(getSkillGraphCacheSizeForTests()).toBe(2);
  });

  it("resolves Prisma org from state.orgScope so one cached graph works for different tenants", async () => {
    const prisma = {
      node: {
        findFirst: vi.fn(({ where }: { where: { orgId: string; name: string } }) => {
          if (where.name !== "shared_node") {
            return Promise.resolve(null);
          }
          return Promise.resolve({
            name: where.name,
            promptTemplate: `tenant=${where.orgId} {{query}}`,
          });
        }),
      },
    } as unknown as RunSkillDeps["prisma"];

    const chatModel = makeMockChatModel("ok");
    const deps: RunSkillDeps = { prisma, pipeline: null, chatModel, orgId: "placeholder" };

    await runSkill(deps, ["shared_node"], {
      query: "hi",
      userId: "u1",
      departmentId: "b0000001-0000-4000-8000-000000000001",
      orgScope: "tenant-a",
    });
    await runSkill(deps, ["shared_node"], {
      query: "hi",
      userId: "u1",
      departmentId: "b0000001-0000-4000-8000-000000000001",
      orgScope: "tenant-b",
    });

    expect(getSkillGraphCacheSizeForTests()).toBe(1);
    const findFirst = prisma.node.findFirst as ReturnType<typeof vi.fn>;
    expect(findFirst.mock.calls[0][0].where.orgId).toBe("tenant-a");
    expect(findFirst.mock.calls[1][0].where.orgId).toBe("tenant-b");
  });
});
