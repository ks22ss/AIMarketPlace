import { describe, expect, it } from "vitest";

import { blockingSkillsForNodeName } from "./skill-queries.js";

describe("blockingSkillsForNodeName", () => {
  it("returns skills whose workflow includes the node name", () => {
    const rows = [
      { skillId: "11111111-1111-1111-1111-111111111111", name: "Alpha", skillNodes: ["retrieve_documents", "summarize"] },
      { skillId: "22222222-2222-2222-2222-222222222222", name: "Beta", skillNodes: ["compliance_intake"] },
    ];
    expect(blockingSkillsForNodeName(rows, "summarize")).toEqual([
      { skill_id: "11111111-1111-1111-1111-111111111111", name: "Alpha" },
    ]);
  });

  it("returns empty when no workflow references the name", () => {
    const rows = [{ skillId: "a", name: "X", skillNodes: ["only_this"] }];
    expect(blockingSkillsForNodeName(rows, "other")).toEqual([]);
  });
});
