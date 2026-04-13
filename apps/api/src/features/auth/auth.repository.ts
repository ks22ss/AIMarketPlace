import type { Pool } from "pg";

import type { UserPublicRow, UserRowWithPasswordHash } from "./auth.dto.js";

export function createAuthRepository(databasePool: Pool) {
  return {
    async findByEmailWithPasswordHash(
      email: string,
    ): Promise<UserRowWithPasswordHash | null> {
      const result = await databasePool.query<UserRowWithPasswordHash>(
        `SELECT user_id, email, role, department, org_id, created_at, password_hash
         FROM users WHERE email = $1`,
        [email],
      );
      return result.rows[0] ?? null;
    },

    async insertMember(
      email: string,
      passwordHash: string,
    ): Promise<UserPublicRow> {
      const result = await databasePool.query<UserPublicRow>(
        `INSERT INTO users (email, password_hash, role)
         VALUES ($1, $2, 'member')
         RETURNING user_id, email, role, department, org_id, created_at`,
        [email, passwordHash],
      );
      const row = result.rows[0];
      if (!row) {
        throw new Error("Insert returned no row");
      }
      return row;
    },

    async findPublicById(userId: string): Promise<UserPublicRow | null> {
      const result = await databasePool.query<UserPublicRow>(
        `SELECT user_id, email, role, department, org_id, created_at
         FROM users WHERE user_id = $1`,
        [userId],
      );
      return result.rows[0] ?? null;
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
