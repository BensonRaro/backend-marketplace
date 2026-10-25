// Proposal service — freelancer bids + owner review (accept flow lands with contracts)
import { prisma } from "../lib/prisma.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import { notifyUser } from "../lib/notify.js";
import { summariesForIds } from "./review.service.js";
import { queueRecommendations } from "./recommendation.service.js";
import type { CreateProposalInput } from "../validators/proposal.validator.js";

// Public freelancer identity + profile for client review (no contact info, no payout data)
const FREELANCER_SELECT = {
  id: true,
  name: true,
  image: true,
  freelancerProfile: { select: { title: true, bio: true, skills: true, hourlyRate: true, location: true, website: true } },
} as const;

// Verified freelancer bids on an open, uncontracted job — dollars in, cents stored
export async function createProposalService(userId: string, role: string, input: CreateProposalInput) {
  if (role !== "freelancer" && role !== "admin") throw apiError("Only freelancers can propose", 403, "FORBIDDEN");
  const job = await prisma.jobPosting.findUnique({ where: { id: input.jobId }, include: { contract: { select: { id: true } }, client: { select: { isBanned: true } }, milestones: { where: { status: "funded" }, select: { id: true }, take: 1 } } });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  if (!job.isOpen) throw apiError("Job is closed to new proposals", 400, "JOB_CLOSED");
  // Suspended clients' postings are closed on ban — a closed job takes no new bids
  if (job.client.isBanned) throw apiError("This job is no longer accepting proposals", 400, "JOB_CLOSED");
  if (job.contract) throw apiError("Job already contracted", 400, "JOB_CONTRACTED");
  // Bids open only on funded work — unfunded jobs stay invisible until escrow is locked
  if (job.escrowStatus !== "funded" && job.milestones.length === 0) throw apiError("Client hasn't funded escrow yet — proposals open once funded", 400, "JOB_UNFUNDED");
  if (job.clientId === userId) throw apiError("You cannot propose on your own job", 403, "FORBIDDEN");
  try {
    const proposal = await prisma.proposal.create({
      data: { jobId: input.jobId, freelancerId: userId, coverLetter: input.coverLetter.trim(), bidAmount: Math.round(input.bidAmount * 100), duration: input.duration ?? null },
      include: { job: { select: { id: true, title: true } } },
    });
    await logActivity(userId, "proposal.submitted", "Proposal", proposal.id, { jobId: input.jobId, bidAmount: proposal.bidAmount });
    await notifyUser(job.clientId, {
      type: "proposal.submitted",
      title: "New proposal received",
      message: `A freelancer bid on "${proposal.job.title}"`,
      entity: "Proposal",
      entityId: proposal.id,
      data: { proposalId: proposal.id, jobId: input.jobId, bidAmount: proposal.bidAmount },
    });
    // Refresh the client's AI shortlist in the background (best-effort — never fails the bid)
    await queueRecommendations(input.jobId);
    return proposal;
  } catch (err) {
    // One proposal per freelancer per job (@@unique) — race-safe via P2002
    if ((err as { code?: string }).code === "P2002") throw apiError("You already proposed on this job", 409, "ALREADY_PROPOSED");
    throw err;
  }
}

// Freelancer's own bids, newest first, with job context for the list UI
export async function listMyProposalsService(userId: string) {
  return prisma.proposal.findMany({
    where: { freelancerId: userId },
    include: { job: { select: { id: true, title: true, budget: true, budgetType: true, isOpen: true, client: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
}

// Owner (or admin) reviews bids on their job — freelancer identity included
export async function listJobProposalsService(userId: string, role: string, jobId: string) {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: { clientId: true } });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  if (job.clientId !== userId && role !== "admin") throw apiError("Only the owner can review proposals", 403, "FORBIDDEN");
  const proposals = await prisma.proposal.findMany({
    where: { jobId, freelancer: { is: { isBanned: false } } },
    include: { freelancer: { select: FREELANCER_SELECT } },
    orderBy: { createdAt: "desc" },
  });
  return withFreelancerRatings(proposals);
}

// Client inbox — every bid across owned jobs, newest first (single query, no N+1)
export async function listClientProposalsService(userId: string) {
  const proposals = await prisma.proposal.findMany({
    // Suspended bidders disappear from client inboxes (their pending bids are rejected on ban)
    where: { job: { clientId: userId }, freelancer: { is: { isBanned: false } } },
    include: {
      job: { select: { id: true, title: true, isOpen: true } },
      freelancer: { select: FREELANCER_SELECT },
    },
    orderBy: { createdAt: "desc" },
  });
  return withFreelancerRatings(proposals);
}

// Bidder reputation for clients hiring — one grouped query across the page
async function withFreelancerRatings<T extends { freelancerId: string }>(proposals: T[]) {
  const ratings = await summariesForIds(proposals.map((p) => p.freelancerId));
  return proposals.map((p) => ({ ...p, freelancerRating: ratings[p.freelancerId] ?? { average: null, count: 0 } }));
}

// Freelancer withdraws their own pending bid — decided bids are immutable
export async function withdrawProposalService(userId: string, role: string, proposalId: string) {
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId } });
  if (!proposal) throw apiError("Proposal not found", 404, "NOT_FOUND");
  if (proposal.freelancerId !== userId && role !== "admin") throw apiError("Only the author can withdraw", 403, "FORBIDDEN");
  if (proposal.status !== "pending") throw apiError("Only pending proposals can be withdrawn", 400, "PROPOSAL_LOCKED");
  await prisma.proposal.delete({ where: { id: proposalId } });
  await logActivity(userId, "proposal.withdrawn", "Proposal", proposalId, { jobId: proposal.jobId });
  return { id: proposalId };
}
