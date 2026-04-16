import { describe, expect, it } from "vitest";

import {
  deriveConversationTitle,
  parseStoredMessages,
  toMessageDto,
  toSummaryDto,
  toConversationDto,
} from "./chat-history.js";

describe("deriveConversationTitle", () => {
  it("uses up to 6 words from the reply", () => {
    expect(deriveConversationTitle("one two three four five six seven eight")).toBe(
      "one two three four five six",
    );
  });

  it("strips <think> blocks before deriving the title", () => {
    expect(
      deriveConversationTitle("<think>reasoning chain</think>Answer is forty two exactly."),
    ).toBe("Answer is forty two exactly.");
  });

  it("truncates long single words to 48 chars with ellipsis", () => {
    const long = "a".repeat(80);
    const title = deriveConversationTitle(long);
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith("...")).toBe(true);
  });

  it("falls back to 'New chat' when the reply is only thinking", () => {
    expect(deriveConversationTitle("<think>internal</think>")).toBe("New chat");
    expect(deriveConversationTitle("   ")).toBe("New chat");
  });

  it("collapses whitespace", () => {
    expect(deriveConversationTitle("hello\n\n  world\tagain")).toBe("hello world again");
  });
});

describe("parseStoredMessages", () => {
  it("drops malformed entries and preserves valid ones", () => {
    const parsed = parseStoredMessages([
      { id: "m1", role: "user", content: "hi", createdAt: "2026-04-17T00:00:00.000Z" },
      { role: "robot", content: "x" },
      { id: "m2", role: "assistant", content: "reply", traceId: "t1" },
      null,
      "string",
    ]);
    expect(parsed.length).toBe(2);
    expect(parsed[0]).toMatchObject({ id: "m1", role: "user", content: "hi" });
    expect(parsed[1]).toMatchObject({ role: "assistant", content: "reply", traceId: "t1" });
    expect(parsed[1].id.length).toBeGreaterThan(0);
  });

  it("returns an empty array for non-array JSON", () => {
    expect(parseStoredMessages({ not: "an array" })).toEqual([]);
    expect(parseStoredMessages(null)).toEqual([]);
    expect(parseStoredMessages("oops")).toEqual([]);
  });
});

describe("toMessageDto / toSummaryDto / toConversationDto", () => {
  it("maps DB row shape to snake_case DTO and ISO strings", () => {
    const createdAt = new Date("2026-04-17T00:00:00.000Z");
    const updatedAt = new Date("2026-04-17T00:05:00.000Z");
    const summary = toSummaryDto({
      conversationId: "c1",
      title: "My chat",
      skillId: null,
      createdAt,
      updatedAt,
    });
    expect(summary).toEqual({
      conversation_id: "c1",
      title: "My chat",
      skill_id: null,
      created_at: "2026-04-17T00:00:00.000Z",
      updated_at: "2026-04-17T00:05:00.000Z",
    });

    const dto = toConversationDto({
      conversationId: "c1",
      title: "My chat",
      skillId: "s1",
      createdAt,
      updatedAt,
      messages: [
        { id: "m1", role: "user", content: "hi", createdAt: createdAt.toISOString() },
        { id: "m2", role: "assistant", content: "yo", traceId: "t1", createdAt: updatedAt.toISOString() },
      ],
    });
    expect(dto.skill_id).toBe("s1");
    expect(dto.messages).toEqual([
      toMessageDto({ id: "m1", role: "user", content: "hi", createdAt: createdAt.toISOString() }),
      toMessageDto({
        id: "m2",
        role: "assistant",
        content: "yo",
        traceId: "t1",
        createdAt: updatedAt.toISOString(),
      }),
    ]);
  });
});
