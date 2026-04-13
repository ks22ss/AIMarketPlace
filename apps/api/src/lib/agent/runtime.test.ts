import { describe, expect, it } from "vitest";

import { isValidNodeName } from "./node-naming.js";
import { injectVariables, type AgentState } from "./runtime.js";

function baseState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    query: "q",
    userId: "u1",
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
