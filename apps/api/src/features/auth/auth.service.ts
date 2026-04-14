import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  mapRowToPublicUser,
  normalizeEmail,
  type LoginBody,
  type PublicUser,
  type RegisterBody,
  type UserPublicRow,
} from "./auth.dto.js";
import type { AuthRepository } from "./auth.repository.js";
import { signAccessToken } from "./auth.jwt.js";

const saltRounds = 12;

export type AuthSuccess = {
  accessToken: string;
  user: PublicUser;
};

export type RegisterOutcome =
  | { kind: "success"; data: AuthSuccess }
  | { kind: "email_exists" }
  | { kind: "invalid_department" }
  | { kind: "internal_error" };

export type LoginOutcome =
  | { kind: "success"; data: AuthSuccess }
  | { kind: "invalid_credentials" }
  | { kind: "internal_error" };

function isUniqueConstraintError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002";
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "23505"
  );
}

export function createAuthService(repository: AuthRepository) {
  async function register(body: RegisterBody): Promise<RegisterOutcome> {
    const email = normalizeEmail(body.email);
    const password = body.password;

    try {
      const departmentOk = await repository.departmentExists(body.department_id);
      if (!departmentOk) {
        return { kind: "invalid_department" };
      }
      const passwordHash = await bcrypt.hash(password, saltRounds);
      const row: UserPublicRow = await repository.insertMember(email, passwordHash, body.department_id);
      const user = mapRowToPublicUser(row);
      const accessToken = signAccessToken({ sub: user.userId, email: user.email });
      return { kind: "success", data: { accessToken, user } };
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        return { kind: "email_exists" };
      }
      console.error("register error", error);
      return { kind: "internal_error" };
    }
  }

  async function login(body: LoginBody): Promise<LoginOutcome> {
    const email = normalizeEmail(body.email);
    const password = body.password;

    try {
      const row = await repository.findByEmailWithPasswordHash(email);
      if (!row) {
        return { kind: "invalid_credentials" };
      }

      const passwordMatches = await bcrypt.compare(password, row.password_hash);
      if (!passwordMatches) {
        return { kind: "invalid_credentials" };
      }

      const user = mapRowToPublicUser({
        user_id: row.user_id,
        email: row.email,
        role: row.role,
        department: row.department,
        org_id: row.org_id,
        created_at: row.created_at,
      });
      const accessToken = signAccessToken({ sub: user.userId, email: user.email });
      return { kind: "success", data: { accessToken, user } };
    } catch (error) {
      console.error("login error", error);
      return { kind: "internal_error" };
    }
  }

  async function getProfileByUserId(userId: string): Promise<PublicUser | null> {
    const row = await repository.findPublicById(userId);
    return row ? mapRowToPublicUser(row) : null;
  }

  return { register, login, getProfileByUserId };
}

export type AuthService = ReturnType<typeof createAuthService>;
