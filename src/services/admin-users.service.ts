// Admin users service — search/filter/paginate accounts (no secrets exposed)
import { prisma } from "../lib/prisma.js";
import type { AdminUsersQuery } from "../validators/admin.validator.js";

export async function listUsersService(query: AdminUsersQuery) {
  const { search, role, status, page, limit } = query;

  const where = {
    ...(role ? { role } : {}),
    ...(status ? { isBanned: status === "banned" } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { clientProfile: { is: { company: { contains: search, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        onboardingCompleted: true,
        stripeVerified: true,
        stripePaymentVerified: true,
        isBanned: true,
        banReason: true,
        bannedAt: true,
        createdAt: true,
        clientProfile: { select: { company: true } },
        freelancerProfile: { select: { title: true } },
        _count: { select: { jobPostings: true, contractsAsClient: true, contractsAsFreelancer: true } },
      },
    }),
  ]);

  // Open (not completed) contracts per user — the number admins need before banning
  const ids = users.map((u) => u.id);
  const [asClient, asFreelancer] = await Promise.all([
    prisma.contract.groupBy({
      by: ["clientId"],
      where: { clientId: { in: ids }, isCompleted: false },
      _count: { _all: true },
    }),
    prisma.contract.groupBy({
      by: ["freelancerId"],
      where: { freelancerId: { in: ids }, isCompleted: false },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map<string, number>();
  for (const row of asClient) counts.set(row.clientId, (counts.get(row.clientId) ?? 0) + row._count._all);
  for (const row of asFreelancer) counts.set(row.freelancerId, (counts.get(row.freelancerId) ?? 0) + row._count._all);

  const data = users.map((u) => ({ ...u, activeContracts: counts.get(u.id) ?? 0 }));

  return {
    data,
    pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) },
  };
}
