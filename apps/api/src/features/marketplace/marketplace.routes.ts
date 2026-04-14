import type { PrismaClient } from "@prisma/client";
import { Router } from "express";

import type { MarketplaceSkillsListResponse, MarketplaceSkillSummaryDto } from "../../contracts/public-api.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import { findVisibleSkillsForUser, parseStoredSkillNodes } from "../skills/skill-queries.js";

const DEFAULT_LIMIT = 16;
const MAX_LIMIT = 32;
/** When `installed_only` is set, allow a larger page size so the reference list can load in one request. */
const MAX_LIMIT_INSTALLED_ONLY = 100;

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

      const installedOnlyRaw = request.query.installed_only;
      const installedOnly =
        installedOnlyRaw === "true" ||
        installedOnlyRaw === "1" ||
        installedOnlyRaw === "yes";

      const pageRaw = request.query.page;
      const limitRaw = request.query.limit;
      const page = Math.max(1, typeof pageRaw === "string" ? Number.parseInt(pageRaw, 10) || 1 : 1);
      const defaultLimit = installedOnly ? MAX_LIMIT_INSTALLED_ONLY : DEFAULT_LIMIT;
      const limitUncapped =
        typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) || defaultLimit : defaultLimit;
      const cap = installedOnly ? MAX_LIMIT_INSTALLED_ONLY : MAX_LIMIT;
      const limit = Math.min(cap, Math.max(1, limitUncapped));

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

      let candidates = result.skills;
      if (installedOnly) {
        candidates = candidates.filter((s) => installedSet.has(s.skillId));
      }

      const total = candidates.length;
      const skip = (page - 1) * limit;
      const pageRows = candidates.slice(skip, skip + limit);

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
