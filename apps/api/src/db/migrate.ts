import type { Pool } from "pg";

export async function runMigrations(databasePool: Pool): Promise<void> {
  await databasePool.query(`
    CREATE TABLE IF NOT EXISTS users (
      user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      department TEXT,
      org_id UUID,
      llm_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT users_email_unique UNIQUE (email)
    )
  `);
}
