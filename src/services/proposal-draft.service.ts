// Draft queue + reads — the bid form requests a draft, Inngest writes it, the form polls for it
import { prisma } from "../lib/prisma.js";
import { apiError } from "../lib/stripe-verify.js";
import { inngest } from "../inngest/client.js";
import { PROPOSAL_DRAFT_EVENT } from "../inngest/proposal-draft.js";

// Same gates as bidding — never draft for a job that cannot be applied to
export async function assertDraftable(userId: string, jobId: string) {
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobId },
    select: { clientId: true, isOpen: true, contract: { select: { id: true } } },
  });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  if (job.clientId === userId) throw apiError("You cannot propose on your own job", 403, "FORBIDDEN");
  if (!job.isOpen) throw apiError("Job is closed to new proposals", 400, "JOB_CLOSED");
  if (job.contract) throw apiError("Job already contracted", 400, "JOB_CONTRACTED");

  const existing = await prisma.proposal.findUnique({
    where: { jobId_freelancerId: { jobId, freelancerId: userId } },
    select: { id: true },
  });
  if (existing) throw apiError("You already proposed on this job", 409, "ALREADY_PROPOSED");
  return job;
}

// Queue one draft per freelancer + job — re-requesting refreshes the same row (no duplicates)
export async function queueDraftService(userId: string, role: string, jobId: string) {
  if (role !== "freelancer" && role !== "admin") {
    throw apiError("Only freelancers can draft proposals", 403, "FORBIDDEN");
  }
  await assertDraftable(userId, jobId);

  const draft = await prisma.proposalDraft.upsert({
    where: { userId_jobId: { userId, jobId } },
    create: { userId, jobId },
    update: { status: "queued", coverLetter: null, model: null, error: null, errorCode: null },
  });

  try {
    await inngest.send({ name: PROPOSAL_DRAFT_EVENT, data: { draftId: draft.id, userId, jobId } });
  } catch {
    // Without the dev server (or Inngest Cloud) nothing will ever pick this up — fail fast
    await prisma.proposalDraft
      .update({
        where: { id: draft.id },
        data: { status: "failed", errorCode: "QUEUE_UNAVAILABLE", error: "Background queue is unavailable" },
      })
      .catch(() => undefined);
    throw apiError(
      "Could not queue the draft — is the Inngest dev server running?",
      503,
      "QUEUE_UNAVAILABLE",
    );
  }

  return { jobId, status: "queued" as const };
}

// Poll target for the form — scoped to the caller, so no one can read another freelancer's draft
export async function getDraftService(userId: string, jobId: string) {
  const draft = await prisma.proposalDraft.findUnique({
    where: { userId_jobId: { userId, jobId } },
  });
  if (!draft) {
    return { jobId, status: "none" as const, coverLetter: null, model: null, error: null, updatedAt: null };
  }
  return {
    jobId,
    status: draft.status,
    coverLetter: draft.coverLetter,
    model: draft.model,
    error: draft.error,
    updatedAt: draft.updatedAt.toISOString(),
  };
}
