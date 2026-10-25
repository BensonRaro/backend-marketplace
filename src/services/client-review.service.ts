// Client review service — freelancers rate clients from the client details sheet.
// Reviews stay contract-bound: we resolve their newest completed, still-unreviewed contract.
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/stripe-verify.js";
import { createReviewService } from "./review.service.js";
import type { CreateReviewInput } from "../validators/review.validator.js";

// Newest completed contract between freelancer + client that the freelancer hasn't rated yet
async function findReviewableContract(freelancerId: string, clientId: string) {
  const contracts = await prisma.contract.findMany({
    where: { clientId, freelancerId, isCompleted: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!contracts.length) return null;
  const reviewed = await prisma.review.findMany({
    where: { authorId: freelancerId, contractId: { in: contracts.map((c) => c.id) } },
    select: { contractId: true },
  });
  const done = new Set(reviewed.map((r) => r.contractId));
  return contracts.find((c) => !done.has(c.id)) ?? null;
}

// Drives the sheet form: can this freelancer still review the client, and have they already?
export async function getClientReviewStatusService(freelancerId: string, clientId: string) {
  if (freelancerId === clientId) return { canReview: false, hasReviewed: false };
  const [contract, reviewedCount] = await Promise.all([
    findReviewableContract(freelancerId, clientId),
    prisma.review.count({ where: { authorId: freelancerId, targetId: clientId } }),
  ]);
  return { canReview: !!contract, hasReviewed: reviewedCount > 0 };
}

// Post the review against the resolved contract (contract rules re-checked in createReviewService)
export async function createClientReviewService(freelancerId: string, clientId: string, input: CreateReviewInput) {
  const contract = await findReviewableContract(freelancerId, clientId);
  if (!contract) throw apiError("No completed contract with this client left to review", 400, "NO_REVIEWABLE_CONTRACT");
  return createReviewService(freelancerId, contract.id, input);
}
