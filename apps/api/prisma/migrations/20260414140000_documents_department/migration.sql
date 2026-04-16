-- Document tenancy: scope rows to department (RAG + API isolation).

ALTER TABLE "documents" ADD COLUMN "department_id" UUID;

UPDATE "documents" AS d
SET "department_id" = u."department_id"
FROM "users" AS u
WHERE d."user_id" IS NOT NULL AND d."user_id" = u."user_id";

-- Orphan rows (no owner): assign default department from seed (Operation).
UPDATE "documents"
SET "department_id" = 'b0000001-0000-4000-8000-000000000001'
WHERE "department_id" IS NULL;

ALTER TABLE "documents" ALTER COLUMN "department_id" SET NOT NULL;

ALTER TABLE "documents" ADD CONSTRAINT "documents_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("department_id") ON DELETE RESTRICT ON UPDATE CASCADE;
