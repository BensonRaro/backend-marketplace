// Milestone CRUD on jobs — client defines milestones upfront (funding lives in escrow.service)
import { prisma } from "../lib/prisma.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import type { MilestoneInput } from "../validators/milestone.validator.js";

// Owner client or admin loads full milestones; others see funded ones only
export async function listJobMilestonesService(userId: string, role: string, jobId: string) {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, select: { clientId: true } });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  const isOwner = job.clientId === userId || role === "admin";
  return prisma.milestone.findMany({
    where: isOwner ? { jobId } : { jobId, status: "funded" },
    select: { id: true, title: true, description: true, amount: true, status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

// Owner adds a milestone to an open, uncontracted job — dollars in, cents stored
export async function createJobMilestoneService(userId: string, role: string, jobId: string, input: MilestoneInput) {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, include: { contract: { select: { id: true } }, _count: { select: { milestones: true } } } });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  if (job.clientId !== userId && role !== "admin") throw apiError("Only the owner can add milestones", 403, "FORBIDDEN");
  if (job.contract) throw apiError("Job already contracted — milestones belong to the contract", 400, "HAS_CONTRACT");
  // Whole-funded jobs take no more funding rounds — hourly/per-milestone work is unaffected
  if (job.escrowStatus === "funded") throw apiError("Job is fully funded — no more milestones needed", 400, "JOB_FUNDED");
  if (job._count.milestones >= 10) throw apiError("Max 10 milestones per job", 400, "LIMIT_REACHED");

  const milestone = await prisma.milestone.create({
    data: { jobId, title: input.title.trim(), description: input.description?.trim() || null, amount: Math.round(input.amount * 100) },
  });
  await logActivity(userId, "milestone.created", "Milestone", milestone.id, { jobId, amount: milestone.amount });
  return milestone;
}

// Owner removes an unfunded milestone — funded escrow can never be deleted
export async function deleteJobMilestoneService(userId: string, role: string, milestoneId: string) {
  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId }, include: { job: { select: { clientId: true } } } });
  if (!milestone?.jobId || !milestone.job) throw apiError("Milestone not found", 404, "NOT_FOUND");
  if (milestone.job.clientId !== userId && role !== "admin") throw apiError("Only the owner can remove milestones", 403, "FORBIDDEN");
  if (milestone.status !== "unfunded") throw apiError("Only unfunded milestones can be removed", 400, "ALREADY_FUNDED");
  await prisma.milestone.delete({ where: { id: milestoneId } });
  await logActivity(userId, "milestone.deleted", "Milestone", milestoneId, { jobId: milestone.jobId });
  return { id: milestoneId };
}

// Contract client adds the next milestone mid-contract — dollars in, cents stored
export async function createContractMilestoneService(userId: string, role: string, contractId: string, input: MilestoneInput) {
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { clientId: true, isCompleted: true, job: { select: { escrowStatus: true } }, _count: { select: { milestones: true } } } });
  if (!contract) throw apiError("Contract not found", 404, "NOT_FOUND");
  if (contract.clientId !== userId && role !== "admin") throw apiError("Only the client can add milestones", 403, "FORBIDDEN");
  if (contract.isCompleted) throw apiError("Contract is completed", 400, "CONTRACT_COMPLETED");
  if (contract.job.escrowStatus === "funded") throw apiError("Job is fully funded — no more milestones needed", 400, "JOB_FUNDED");
  if (contract._count.milestones >= 10) throw apiError("Max 10 milestones per contract", 400, "LIMIT_REACHED");

  const milestone = await prisma.milestone.create({
    data: { contractId, title: input.title.trim(), description: input.description?.trim() || null, amount: Math.round(input.amount * 100) },
  });
  await logActivity(userId, "milestone.created", "Milestone", milestone.id, { contractId, amount: milestone.amount });
  return milestone;
}
