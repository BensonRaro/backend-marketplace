// Review management — authors edit/delete their own ratings (rating summaries re-aggregate on read)
import { prisma } from "../lib/prisma.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import { AUTHOR_SELECT } from "./review.service.js";
import type { CreateReviewInput } from "../validators/review.validator.js";

// Author-only edit — keeps contract/target immutable, only rating + comment change
export async function updateReviewService(userId: string, reviewId: string, input: CreateReviewInput) {
  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, authorId: true, rating: true, comment: true, contractId: true },
  });
  if (!existing) throw apiError("Review not found", 404, "NOT_FOUND");
  if (existing.authorId !== userId) throw apiError("You can only edit your own review", 403, "FORBIDDEN");

  const review = await prisma.review.update({
    where: { id: reviewId },
    data: { rating: input.rating, comment: input.comment?.trim() || null },
    include: { author: { select: AUTHOR_SELECT } },
  });
  await logActivity(userId, "review.updated", "Review", review.id, {
    contractId: existing.contractId,
    before: { rating: existing.rating, comment: existing.comment },
    after: { rating: review.rating, comment: review.comment },
  });
  return review;
}

// Author-only delete — frees the contract slot so the review can be written again
export async function deleteReviewService(userId: string, reviewId: string) {
  const existing = await prisma.review.findUnique({
    where: { id: reviewId },
    select: { id: true, authorId: true, contractId: true, rating: true },
  });
  if (!existing) throw apiError("Review not found", 404, "NOT_FOUND");
  if (existing.authorId !== userId) throw apiError("You can only delete your own review", 403, "FORBIDDEN");

  await prisma.review.delete({ where: { id: reviewId } });
  await logActivity(userId, "review.deleted", "Review", existing.id, {
    contractId: existing.contractId,
    rating: existing.rating,
  });
  return { id: existing.id };
}
