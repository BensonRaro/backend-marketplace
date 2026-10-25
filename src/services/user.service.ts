// User service — public profile lookups + aggregate trust stats (client details sheet)
import { prisma } from "../lib/prisma.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import { summariesForIds } from "./review.service.js";
import type { UpdateMyProfileInput } from "../validators/user.validator.js";

// Public, read-only view of a user: basics + client profile + spend/rating stats (no private fields)
export async function getPublicProfileService(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      image: true,
      role: true,
      isBanned: true,
      createdAt: true,
      clientProfile: { select: { company: true, bio: true, location: true, website: true } },
    },
  });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  // Suspended accounts disappear from public surfaces (they still see their own data)
  if (user.isBanned) throw apiError("User not found", 404, "NOT_FOUND");

  // Aggregate in parallel — released escrow is the client's real spend
  const [jobsPosted, contractsCompleted, spent, ratings] = await Promise.all([
    prisma.jobPosting.count({ where: { clientId: userId } }),
    prisma.contract.count({ where: { clientId: userId, isCompleted: true } }),
    prisma.milestone.aggregate({
      _sum: { amount: true },
      where: { status: "released", contract: { is: { clientId: userId } } },
    }),
    summariesForIds([userId]),
  ]);

  return {
    ...user,
    stats: { jobsPosted, contractsCompleted, totalSpent: spent._sum.amount ?? 0 },
    rating: ratings[userId] ?? { average: null, count: 0 },
  };
}

// Own account basics — name + avatar only (role and verification stay server-controlled)
export async function updateMyProfileService(userId: string, input: UpdateMyProfileInput) {
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, image: true } });
  if (!before) throw apiError("User not found", 404, "NOT_FOUND");

  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name || null } : {}),
      ...(input.image !== undefined ? { image: input.image || null } : {}),
    },
    select: { id: true, name: true, email: true, image: true, role: true },
  });
  await logActivity(userId, "user.profile.updated", "User", userId, {
    before: { name: before.name, image: before.image },
    after: { name: user.name, image: user.image },
  });
  return user;
}
