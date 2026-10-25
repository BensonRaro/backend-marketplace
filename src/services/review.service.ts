// Review service — post-completion two-way ratings (client ↔ freelancer)
import { prisma } from "../lib/prisma.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import { notifyUser } from "../lib/notify.js";
import type { CreateReviewInput } from "../validators/review.validator.js";

export const AUTHOR_SELECT = { id: true, name: true, image: true } as const;

export type RatingSummary = { average: number | null; count: number };

// Shared average helper — one groupBy for many users (no N+1 on job/proposal lists)
export async function summariesForIds(ids: string[]): Promise<Record<string, RatingSummary>> {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return {};
  const rows = await prisma.review.groupBy({
    by: ["targetId"],
    // Suspended authors' ratings no longer count toward public reputation
    where: { targetId: { in: uniq }, author: { is: { isBanned: false } } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const out: Record<string, RatingSummary> = {};
  for (const id of uniq) {
    const r = rows.find((x) => x.targetId === id);
    out[id] = { average: r?._avg.rating == null ? null : Math.round(r._avg.rating * 10) / 10, count: r?._count._all ?? 0 };
  }
  return out;
}

// Party rates the other side — completed contracts only, one review each (P2002-guarded)
export async function createReviewService(userId: string, contractId: string, input: CreateReviewInput) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, clientId: true, freelancerId: true, isCompleted: true, job: { select: { title: true } } },
  });
  if (!contract) throw apiError("Contract not found", 404, "NOT_FOUND");
  if (contract.clientId !== userId && contract.freelancerId !== userId) throw apiError("Only contract parties can review", 403, "FORBIDDEN");
  if (!contract.isCompleted) throw apiError("You can review once the contract is completed", 400, "CONTRACT_NOT_COMPLETED");
  const targetId = userId === contract.clientId ? contract.freelancerId : contract.clientId;
  try {
    const review = await prisma.review.create({
      data: { authorId: userId, targetId, contractId, rating: input.rating, comment: input.comment?.trim() || null },
      include: { author: { select: AUTHOR_SELECT } },
    });
    await logActivity(userId, "review.created", "Review", review.id, { contractId, rating: input.rating });
    await notifyUser(targetId, {
      type: "review.received",
      title: "New review received",
      message: `You received a ${input.rating}-star review`,
      entity: "Review",
      entityId: review.id,
      data: { reviewId: review.id, contractId, rating: input.rating },
    });
    return review;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw apiError("You already reviewed this contract", 409, "ALREADY_REVIEWED");
    throw err;
  }
}

// Both parties (or admin) read a contract's reviews — powers the rate/readonly states
export async function listContractReviewsService(userId: string, role: string, contractId: string) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientId: true, freelancerId: true } });
  if (!contract) throw apiError("Contract not found", 404, "NOT_FOUND");
  if (contract.clientId !== userId && contract.freelancerId !== userId && role !== "admin") throw apiError("Contract not found", 404, "NOT_FOUND");
  return prisma.review.findMany({
    where: { contractId },
    include: { author: { select: AUTHOR_SELECT } },
    orderBy: { createdAt: "asc" },
  });
}

// Public summary for hiring decisions (no existence check — unknown users read 0/0)
export async function ratingSummaryService(targetId: string) {
  return (await summariesForIds([targetId]))[targetId] ?? { average: null, count: 0 };
}

// Public recent reviews with author context (testimonials on proposals)
export async function listUserReviewsService(targetId: string, limit?: number) {
  return prisma.review.findMany({
    where: { targetId, author: { is: { isBanned: false } } },
    include: { author: { select: AUTHOR_SELECT } },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(Number(limit) || 5, 1), 10),
  });
}
