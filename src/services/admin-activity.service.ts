// Admin activity service — paginated audit trail with actor names resolved
import { prisma } from "../lib/prisma.js";
import type { AdminActivityQuery } from "../validators/admin.validator.js";

export async function listActivityLogsService(query: AdminActivityQuery) {
  const { action, actorId, page, limit } = query;

  const where = {
    ...(action ? { action: { contains: action, mode: "insensitive" as const } } : {}),
    ...(actorId ? { actorId } : {}),
  };

  const [total, logs, actionRows] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activityLog.groupBy({ by: ["action"] }),
  ]);

  // ActivityLog.actorId is a plain string (no relation) — resolve names in one batch
  const actorIds = [...new Set(logs.map((l) => l.actorId).filter((id): id is string => !!id))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, image: true, role: true } })
    : [];
  const byId = new Map(actors.map((a) => [a.id, a]));

  return {
    data: logs.map((l) => ({ ...l, actor: l.actorId ? (byId.get(l.actorId) ?? null) : null })),
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
    actions: actionRows.map((r) => r.action).sort(),
  };
}
