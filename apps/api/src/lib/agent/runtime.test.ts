import { describe, expect, it } from "vitest";

import type { DocumentPipeline } from "../../features/docs/document.pipeline.js";
import { isValidNodeName } from "./node-naming.js";
import { buildSkillExecutionOrder, injectVariables, type AgentState } from "./runtime.js";

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    query: "q",
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
