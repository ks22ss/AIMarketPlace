-- Drop DB-level UUID defaults on primary keys (must run after init_core_entities).
-- Prisma applies migrations in lexicographic folder order.

-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "doc_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "skills" ALTER COLUMN "skill_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tools" ALTER COLUMN "tool_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "user_id" DROP DEFAULT;
