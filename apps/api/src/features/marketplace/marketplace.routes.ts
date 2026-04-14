import type { PrismaClient } from "@prisma/client";
import { Router } from "express";

import type { MarketplaceSkillsListResponse, MarketplaceSkillSummaryDto } from "../../contracts/public-api.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { findVisibleSkillsForUser, parseStoredSkillNodes } from "../skills/skill-queries.js";

const DEFAULT_LIMIT = 16;
const MAX_LIMIT = 32;

export function createMarketplaceRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get(
    "/skills",
    requireAuth,
    asyncHandler(async (request, response) => {
      const auth = request.authUser;
      if (!auth) {
        response.status(401).json({ error: "Unauthorized" });
        return;
      }

      const pageRaw = request.query.page;
      const limitRaw = request.query.limit;
      const page = Math.max(1, typeof pageRaw === "string" ? Number.parseInt(pageRaw, 10) || 1 : 1);
      const limitUncapped =
        typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) || DEFAULT_LIMIT : DEFAULT_LIMIT;
      const limit = Math.min(MAX_LIMIT, Math.max(1, limitUncapped));

      const result = await findVisibleSkillsForUser(prisma, auth.userId);
      if (!result) {
        response.status(401).json({ error: "User not found" });
        return;
      }

      const installedRows = await prisma.userSkill.findMany({
        where: { userId: auth.userId },
        select: { skillId: true },
      });
      const installedSet = new Set(installedRows.map((r) => r.skillId));

      const { skills: visible } = result;
      const total = visible.length;
      const skip = (page - 1) * limit;
      const pageRows = visible.slice(skip, skip + limit);

      const skills: MarketplaceSkillSummaryDto[] = pageRows.map((s) => ({
        skill_id: s.skillId,
        name: s.name,
        description: s.description,
        nodes: parseStoredSkillNodes(s.skillNodes),
        org_id: s.orgId,
        created_at: s.createdAt.toISOString(),
        installed: installedSet.has(s.skillId),
      }));

      const payload: MarketplaceSkillsListResponse = {
        skills,
        page,
        limit,
        total,
      };
      response.json(payload);
    }),
  );

  return router;
}
