import type { PrismaClient } from "@prisma/client";
import { Router } from "express";

import { asyncHandler } from "../../lib/async-handler.js";

export function createReferenceRouter(prisma: PrismaClient): Router {
  const router = Router();

  router.get(
    "/departments",
    asyncHandler(async (_request, response) => {
      const rows = await prisma.department.findMany({
        orderBy: { name: "asc" },
        select: { departmentId: true, name: true },
      });
      response.json({
        departments: rows.map((d) => ({ id: d.departmentId, name: d.name })),
      });
    }),
  );

  router.get(
    "/roles",
    asyncHandler(async (_request, response) => {
      const rows = await prisma.role.findMany({
        orderBy: { slug: "asc" },
        select: { roleId: true, slug: true, label: true },
      });
      response.json({
        roles: rows.map((r) => ({ id: r.roleId, slug: r.slug, label: r.label })),
      });
    }),
  );

  return router;
}
