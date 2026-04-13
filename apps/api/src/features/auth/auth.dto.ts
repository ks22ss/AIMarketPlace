import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
});

export const loginBodySchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;

export type PublicUser = {
  userId: string;
  email: string;
  role: string;
  department: string | null;
  orgId: string | null;
  createdAt: string;
};

/** Row shape returned by SELECT without password_hash */
export type UserPublicRow = {
  user_id: string;
  email: string;
  role: string;
  department: string | null;
  org_id: string | null;
  created_at: Date;
};

export type UserRowWithPasswordHash = UserPublicRow & {
  password_hash: string;
};

export function mapRowToPublicUser(row: UserPublicRow): PublicUser {
  return {
    userId: row.user_id,
    email: row.email,
    role: row.role,
    department: row.department,
    orgId: row.org_id,
    createdAt: row.created_at.toISOString(),
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
