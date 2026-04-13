import type { PrismaClient } from "@prisma/client";

import type { UserPublicRow, UserRowWithPasswordHash } from "./auth.dto.js";

export function createAuthRepository(prisma: PrismaClient) {
  return {
    async findByEmailWithPasswordHash(
      email: string,
    ): Promise<UserRowWithPasswordHash | null> {
      const user = await prisma.user.findUnique({
        where: { email },
      });
      if (!user) {
        return null;
      }
      return {
        user_id: user.userId,
        email: user.email,
        role: user.role,
        department: user.department,
        org_id: user.orgId,
        created_at: user.createdAt,
        password_hash: user.passwordHash,
      };
    },

    async insertMember(
      email: string,
      passwordHash: string,
    ): Promise<UserPublicRow> {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          role: "member",
        },
      });
      return {
        user_id: user.userId,
        email: user.email,
        role: user.role,
        department: user.department,
        org_id: user.orgId,
        created_at: user.createdAt,
      };
    },

    async findPublicById(userId: string): Promise<UserPublicRow | null> {
      const user = await prisma.user.findUnique({
        where: { userId },
        select: {
          userId: true,
          email: true,
          role: true,
          department: true,
          orgId: true,
          createdAt: true,
        },
      });
      if (!user) {
        return null;
      }
      return {
        user_id: user.userId,
        email: user.email,
        role: user.role,
        department: user.department,
        org_id: user.orgId,
        created_at: user.createdAt,
      };
    },
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
