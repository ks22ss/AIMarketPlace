-- Composable nodes + linear skill workflow (ordered node names in skills.nodes)

CREATE TABLE "nodes" (
    "node_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "prompt_template" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "allow_role" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allow_department" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "nodes_pkey" PRIMARY KEY ("node_id")
);

CREATE UNIQUE INDEX "nodes_org_id_name_key" ON "nodes"("org_id", "name");

ALTER TABLE "nodes" ADD CONSTRAINT "nodes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skills" ADD COLUMN "org_id" UUID;
ALTER TABLE "skills" ADD COLUMN "nodes" JSONB NOT NULL DEFAULT '[]';
