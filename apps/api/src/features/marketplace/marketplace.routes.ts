import type { PrismaClient } from "@prisma/client";
import { Router, type Request } from "express";

import type { MarketplaceSkillsListResponse, MarketplaceSkillSummaryDto } from "../../contracts/public-api.js";
import { accessSummaryForSkill } from "../../lib/access-summary.js";
import { asyncHandler } from "../../lib/async-handler.js";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  findOrgSkillsWithAccessForUser,
  parseStoredSkillNodes,
  type SkillWithAccess,
} from "../skills/skill-queries.js";

const DEFAULT_LIMIT = 16;
const MAX_LIMIT = 32;
/** When `installed_only` is set, allow a larger page size so the reference list can load in one request. */
const MAX_LIMIT_INSTALLED_ONLY = 100;

function installedOnlyFromQuery(query: Request["query"]): boolean {
  const raw = query.installed_only;
  return raw === "true" || raw === "1" || raw === "yes";
}

function accessibleOnlyFromQuery(query: Request["query"]): boolean {
  const raw = query.accessible_only;
  return raw === "true" || raw === "1" || raw === "yes";
}

function sortModeFromQuery(query: Request["query"]): "default" | "accessible_first" {
  const raw = query.sort;
  return raw === "accessible_first" ? "accessible_first" : "default";
}

function searchQueryFromQuery(query: Request["query"]): string {
  const raw = query.q;
  return typeof raw === "string" ? raw : "";
}

/** Search without leaking locked skill names: only match public fields for inaccessible rows. */
function marketplaceRowMatchesSearch(row: SkillWithAccess, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const { skill, accessible } = row;
  if (skill.skillId.toLowerCase().includes(q)) {
    return true;
  }
  if (accessible) {
    if (skill.name.toLowerCase().includes(q)) {
      return true;
    }
    if ((skill.description ?? "").toLowerCase().includes(q)) {
      return true;
    }
    return false;
  }
  const summary = accessSummaryForSkill(skill.allowRole, skill.allowDepartment).toLowerCase();
  return summary.includes(q);
}

function orderMarketplaceCandidates(
  rows: SkillWithAccess[],
  sort: "default" | "accessible_first",
): SkillWithAccess[] {
  if (sort !== "accessible_first") {
    return rows;
  }
  return [...rows].sort((a, b) => {
    if (a.accessible !== b.accessible) {
      return a.accessible ? -1 : 1;
    }
    return b.skill.createdAt.getTime() - a.skill.createdAt.getTime();
  });
}

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

      const installedOnly = installedOnlyFromQuery(request.query);

      const pageRaw = request.query.page;
      const limitRaw = request.query.limit;
      const page = Math.max(1, typeof pageRaw === "string" ? Number.parseInt(pageRaw, 10) || 1 : 1);
      const defaultLimit = installedOnly ? MAX_LIMIT_INSTALLED_ONLY : DEFAULT_LIMIT;
      const limitUncapped =
        typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) || defaultLimit : defaultLimit;
      const cap = installedOnly ? MAX_LIMIT_INSTALLED_ONLY : MAX_LIMIT;
      const limit = Math.min(cap, Math.max(1, limitUncapped));

      const result = await findOrgSkillsWithAccessForUser(prisma, auth.userId);
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
        candidates = candidates.filter(
          (row) => row.accessible && installedSet.has(row.skill.skillId),
        );
      } else {
        if (accessibleOnlyFromQuery(request.query)) {
          candidates = candidates.filter((row) => row.accessible);
        }
        const searchQ = searchQueryFromQuery(request.query);
        if (searchQ.trim()) {
          candidates = candidates.filter((row) => marketplaceRowMatchesSearch(row, searchQ));
        }
        const sortMode = sortModeFromQuery(request.query);
        candidates = orderMarketplaceCandidates(candidates, sortMode);
      }

      const total = candidates.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const skip = (safePage - 1) * limit;
      const pageRows = candidates.slice(skip, skip + limit);

      const skills: MarketplaceSkillSummaryDto[] = pageRows.map(({ skill: s, accessible }) => {
        const summary = accessSummaryForSkill(s.allowRole, s.allowDepartment);
        const installed = installedSet.has(s.skillId);
        if (accessible) {
          return {
            skill_id: s.skillId,
            name: s.name,
            description: s.description,
            nodes: parseStoredSkillNodes(s.skillNodes),
            org_id: s.orgId,
            created_at: s.createdAt.toISOString(),
            installed,
            accessible: true,
            access_summary: summary,
            detail_hidden: false,
          };
        }
        return {
          skill_id: s.skillId,
          name: null,
          description: null,
          nodes: [],
          org_id: s.orgId,
          created_at: s.createdAt.toISOString(),
          installed,
          accessible: false,
          access_summary: summary,
          detail_hidden: true,
        };
      });

      const payload: MarketplaceSkillsListResponse = {
        skills,
        page: safePage,
        limit,
        total,
      };
      response.json(payload);
    }),
  );

  return router;
}
