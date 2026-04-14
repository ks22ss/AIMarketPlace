import type { PrismaClient } from "@prisma/client";

import { DEFAULT_ORG_ID } from "../../lib/org-config.js";
import type { UserPublicRow, UserRowWithPasswordHash } from "./auth.dto.js";

export function createAuthRepository(prisma: PrismaClient) {
  return {
    async findByEmailWithPasswordHash(email: string): Promise<UserRowWithPasswordHash | null> {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { department: { select: { name: true } } },
      });
      if (!user) {
        return null;
      }
      return {
        user_id: user.userId,
        email: user.email,
        role: user.role,
        department: user.department.name,
        department_id: user.departmentId,
        org_id: user.orgId,
        created_at: user.createdAt,
        password_hash: user.passwordHash,
      };
    },

    async insertMember(
      email: string,
      passwordHash: string,
      departmentId: string,
    ): Promise<UserPublicRow> {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: "member",
          departmentId,
          orgId: DEFAULT_ORG_ID,
        },
        include: { department: { select: { name: true } } },
      });
      return {
        user_id: user.userId,
        email: user.email,
        role: user.role,
        department: user.department.name,
        department_id: user.departmentId,
        org_id: user.orgId,
        created_at: user.createdAt,
      };
    },

    async findPublicById(userId: string): Promise<UserPublicRow | null> {
      const user = await prisma.user.findUnique({
        where: { userId },
        include: { department: { select: { name: true } } },
      });
      if (!user) {
        return null;
      }
      return {
        user_id: user.userId,
        email: user.email,
        role: user.role,
        department: user.department.name,
        department_id: user.departmentId,
        org_id: user.orgId,
        created_at: user.createdAt,
      };
    },

    async departmentExists(departmentId: string): Promise<boolean> {
      const row = await prisma.department.findUnique({
        where: { departmentId },
        select: { departmentId: true },
      });
      return row !== null;
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
