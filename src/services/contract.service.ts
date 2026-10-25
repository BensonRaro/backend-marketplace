// Contract service — accept creates contract, rejects rest, moves milestones, closes job
import { prisma } from "../lib/prisma.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import { notifyUser } from "../lib/notify.js";

const PARTY_SELECT = { id: true, name: true, image: true, isBanned: true } as const;
const MILESTONE_SELECT = { id: true, title: true, description: true, amount: true, status: true, createdAt: true, updatedAt: true, deliverables: true, submissionNote: true, submittedAt: true } as const;

// Owner accepts a pending bid — sequential writes, unique guards make retry safe
export async function acceptProposalService(userId: string, role: string, proposalId: string) {
  const proposal = await prisma.proposal.findUnique({ where: { id: proposalId }, include: { job: { select: { id: true, clientId: true, isOpen: true, budget: true, escrowStatus: true, stripePaymentIntentId: true, contract: { select: { id: true } } } } } });
  if (!proposal?.job) throw apiError("Proposal not found", 404, "NOT_FOUND");
  if (proposal.job.clientId !== userId && role !== "admin") throw apiError("Only the owner can accept", 403, "FORBIDDEN");
  if (proposal.status !== "pending") throw apiError("Only pending proposals can be accepted", 400, "PROPOSAL_LOCKED");
  if (proposal.job.contract) throw apiError("Job already contracted", 400, "JOB_CONTRACTED");

  // A suspended freelancer cannot be hired — their pending bids are rejected at ban time
  const bidder = await prisma.user.findUnique({ where: { id: proposal.freelancerId }, select: { isBanned: true } });
  if (bidder?.isBanned) throw apiError("This freelancer's account is suspended — the proposal cannot be accepted", 400, "FREELANCER_BANNED");

  try {
    const contract = await prisma.contract.create({
      data: { jobId: proposal.jobId, proposalId: proposal.id, clientId: proposal.job.clientId, freelancerId: proposal.freelancerId },
      include: { job: { select: { id: true, title: true } }, milestones: { select: MILESTONE_SELECT } },
    });
    await prisma.proposal.update({ where: { id: proposalId }, data: { status: "accepted" } });
    await prisma.proposal.updateMany({ where: { jobId: proposal.jobId, status: "pending", id: { not: proposalId } }, data: { status: "rejected" } });
    // Upfront milestones move with the work — escrow they hold moves too
    await prisma.milestone.updateMany({ where: { jobId: proposal.jobId, contractId: null }, data: { jobId: null, contractId: contract.id } });
    // Whole-job escrow mirrors as one funded milestone ( PI-deduped, so retries can't double it)
    if (proposal.job.escrowStatus === "funded" && proposal.job.stripePaymentIntentId) {
      const mirror = await prisma.milestone.findFirst({ where: { contractId: contract.id, stripePaymentIntentId: proposal.job.stripePaymentIntentId } });
      if (!mirror) {
        await prisma.milestone.create({
          data: { contractId: contract.id, title: "Full project", description: "Whole-job escrow", amount: proposal.job.budget, status: "funded", stripePaymentIntentId: proposal.job.stripePaymentIntentId },
        });
      }
    }
    if (proposal.job.isOpen) await prisma.jobPosting.update({ where: { id: proposal.jobId }, data: { isOpen: false } });
    await logActivity(userId, "proposal.accepted", "Proposal", proposalId, { contractId: contract.id });
    await logActivity(userId, "contract.created", "Contract", contract.id, { jobId: proposal.jobId, freelancerId: proposal.freelancerId });
    await notifyUser(proposal.freelancerId, {
      type: "proposal.accepted",
      title: "Proposal accepted",
      message: `Your proposal for "${contract.job.title}" was accepted`,
      entity: "Proposal",
      entityId: proposalId,
      data: { proposalId, contractId: contract.id, jobId: proposal.jobId },
    });
    await notifyUser(proposal.freelancerId, {
      type: "contract.created",
      title: "New contract started",
      message: `Contract created for "${contract.job.title}"`,
      entity: "Contract",
      entityId: contract.id,
      data: { contractId: contract.id, jobId: proposal.jobId },
    });
    await notifyUser(proposal.job.clientId, {
      type: "contract.created",
      title: "New contract started",
      message: `Contract created for "${contract.job.title}"`,
      entity: "Contract",
      entityId: contract.id,
      data: { contractId: contract.id, jobId: proposal.jobId },
    });
    return contract;
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") throw apiError("Job already contracted", 400, "JOB_CONTRACTED");
    throw err;
  }
}

// Client closes the books — every milestone released (unfunded scope excluded), then both sides review
export async function completeContractService(userId: string, role: string, contractId: string) {
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { milestones: { select: { status: true } }, job: { select: { title: true } } },
  });
  if (!contract) throw apiError("Contract not found", 404, "NOT_FOUND");
  if (contract.clientId !== userId && role !== "admin") throw apiError("Only the client can complete", 403, "FORBIDDEN");
  if (contract.isCompleted) throw apiError("Contract already completed", 400, "ALREADY_COMPLETED");
  const blocking = contract.milestones.filter((m) => m.status !== "released" && m.status !== "unfunded");
  if (blocking.length) throw apiError("Release all milestones before completing", 400, "MILESTONES_OPEN");
  await prisma.contract.update({ where: { id: contractId }, data: { isCompleted: true } });
  await logActivity(userId, "contract.completed", "Contract", contractId, {});
  await notifyUser(contract.freelancerId, {
    type: "contract.completed",
    title: "Contract completed",
    message: `"${contract.job.title}" is complete — leave your review`,
    entity: "Contract",
    entityId: contractId,
    data: { contractId },
  });
  return { id: contractId, isCompleted: true };
}

// Role-aware inbox — clients see hired work, freelancers see their gigs
export async function listMyContractsService(userId: string, role: string) {
  const where = role === "freelancer" ? { freelancerId: userId } : role === "client" ? { clientId: userId } : { OR: [{ clientId: userId }, { freelancerId: userId }] };
  return prisma.contract.findMany({
    where: where as never,
    include: {
      job: { select: { id: true, title: true, escrowStatus: true } },
      client: { select: PARTY_SELECT },
      freelancer: { select: PARTY_SELECT },
      milestones: { select: MILESTONE_SELECT, orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}
