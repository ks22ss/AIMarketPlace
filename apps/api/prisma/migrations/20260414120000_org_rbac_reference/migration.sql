-- Reference tables + fixed org; backfill users/skills/nodes to DEFAULT_ORG_ID
CREATE TABLE "departments" (
    "department_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("department_id")
);

CREATE UNIQUE INDEX "departments_name_key" ON "departments"("name");

CREATE TABLE "roles" (
    "role_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id")
);

CREATE UNIQUE INDEX "roles_slug_key" ON "roles"("slug");

INSERT INTO "departments" ("department_id", "name") VALUES
    ('b0000001-0000-4000-8000-000000000001', 'Operation'),
    ('b0000002-0000-4000-8000-000000000001', 'Finance'),
    ('b0000003-0000-4000-8000-000000000001', 'Compliance'),
    ('b0000004-0000-4000-8000-000000000001', 'Human Resources'),
    ('b0000005-0000-4000-8000-000000000001', 'Administrative'),
    ('b0000006-0000-4000-8000-000000000001', 'IT'),
    ('b0000007-0000-4000-8000-000000000001', 'Marketing'),
    ('b0000008-0000-4000-8000-000000000001', 'Product');

INSERT INTO "roles" ("role_id", "slug", "label") VALUES
    ('c0000001-0000-4000-8000-000000000001', 'member', 'Member'),
    ('c0000002-0000-4000-8000-000000000001', 'admin', 'Admin');

-- Normalize org to single tenant
UPDATE "users" SET "org_id" = 'a0000001-0000-4000-8000-000000000001';
UPDATE "skills" SET "org_id" = 'a0000001-0000-4000-8000-000000000001';
UPDATE "nodes" SET "org_id" = 'a0000001-0000-4000-8000-000000000001';
UPDATE "documents" SET "org_id" = 'a0000001-0000-4000-8000-000000000001' WHERE "org_id" IS NOT NULL;

-- User department FK (replace legacy string column)
ALTER TABLE "users" ADD COLUMN "department_id" UUID;

UPDATE "users" SET "department_id" = 'b0000001-0000-4000-8000-000000000001' WHERE "department_id" IS NULL;

ALTER TABLE "users" DROP COLUMN IF EXISTS "department";

ALTER TABLE "users" ALTER COLUMN "department_id" SET NOT NULL;

ALTER TABLE "users" ADD CONSTRAINT "users_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;
