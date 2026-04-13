-- Spec §4 — skill_tools join between skills and tools

CREATE TABLE "skill_tools" (
    "skill_id" UUID NOT NULL,
    "tool_id" UUID NOT NULL,
    CONSTRAINT "skill_tools_pkey" PRIMARY KEY ("skill_id","tool_id")
);

ALTER TABLE "skill_tools" ADD CONSTRAINT "skill_tools_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("skill_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skill_tools" ADD CONSTRAINT "skill_tools_tool_id_fkey" FOREIGN KEY ("tool_id") REFERENCES "tools"("tool_id") ON DELETE CASCADE ON UPDATE CASCADE;
