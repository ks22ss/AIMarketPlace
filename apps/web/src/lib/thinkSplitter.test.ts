import { describe, expect, it } from "vitest";

import { createThinkSplitter, splitThinkText } from "./thinkSplitter";

function concat(tokens: { kind: "content" | "reasoning"; text: string }[]): {
  content: string;
  reasoning: string;
} {
  let content = "";
  let reasoning = "";
  for (const tok of tokens) {
    if (tok.kind === "content") content += tok.text;
    else reasoning += tok.text;
  }
  return { content, reasoning };
}

describe("createThinkSplitter", () => {
  it("splits a single contiguous <think> block from surrounding content", () => {
    const splitter = createThinkSplitter();
    const tokens = [
      ...splitter.push("hello <think>internal</think> world"),
      ...splitter.flush(),
    ];
    expect(concat(tokens)).toEqual({ content: "hello  world", reasoning: "internal" });
  });

  it("handles an opening tag split across chunk boundaries", () => {
    const splitter = createThinkSplitter();
    const tokens = [
      ...splitter.push("hel"),
      ...splitter.push("lo <thi"),
      ...splitter.push("nk>reason</think> rest"),
      ...splitter.flush(),
    ];
    expect(concat(tokens)).toEqual({ content: "hello  rest", reasoning: "reason" });
  });

  it("handles a closing tag split across chunk boundaries", () => {
    const splitter = createThinkSplitter();
    const tokens = [
      ...splitter.push("<think>abc"),
      ...splitter.push("</thi"),
      ...splitter.push("nk>done"),
      ...splitter.flush(),
    ];
    expect(concat(tokens)).toEqual({ content: "done", reasoning: "abc" });
  });

  it("supports multiple think blocks in one stream", () => {
    const splitter = createThinkSplitter();
    const tokens = [
      ...splitter.push("A<think>one</think>B<think>two</think>C"),
      ...splitter.flush(),
    ];
    expect(concat(tokens)).toEqual({ content: "ABC", reasoning: "onetwo" });
  });

  it("never emits the marker text itself", () => {
    const splitter = createThinkSplitter();
    const tokens = [
      ...splitter.push("x<think>y</think>z"),
      ...splitter.flush(),
    ];
    for (const tok of tokens) {
      expect(tok.text).not.toContain("<think>");
      expect(tok.text).not.toContain("</think>");
    }
  });

  it("flushes a stream that ends mid-reasoning (no closing tag)", () => {
    const splitter = createThinkSplitter();
    const tokens = [
      ...splitter.push("pre <think>dangling"),
      ...splitter.flush(),
    ];
    expect(concat(tokens)).toEqual({ content: "pre ", reasoning: "dangling" });
  });

  it("splitThinkText rehydrates persisted content in one call", () => {
    expect(splitThinkText("a<think>b</think>c")).toEqual({ content: "ac", reasoning: "b" });
    expect(splitThinkText("no tags here")).toEqual({
      content: "no tags here",
      reasoning: "",
    });
    expect(splitThinkText("")).toEqual({ content: "", reasoning: "" });
  });
});
