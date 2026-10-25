// Milestone lifecycle — funded → submitted → released (transfer minus fee) or disputed
import { prisma } from "../lib/prisma.js";
import { stripe } from "../lib/stripe.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import { notifyUser } from "../lib/notify.js";
import { ESCROW_CURRENCY, quoteEscrow } from "./escrow.service.js";
import type { SubmitMilestoneInput } from "../validators/milestone-lifecycle.validator.js";

// Lifecycle acts on contract milestones only — job milestones gain a counterparty at accept
async function loadContractMilestone(milestoneId: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: {
      contract: { select: { id: true, clientId: true, freelancerId: true } },
    },
  });
  if (!milestone) throw apiError("Milestone not found", 404, "NOT_FOUND");
  if (!milestone.contractId || !milestone.contract)
    throw apiError(
      "Milestone has no contract yet — assign a freelancer first",
      400,
      "NO_CONTRACT",
    );
  return milestone;
}

// Freelancer marks funded work delivered — deliverables (files/links) + optional note
export async function submitMilestoneService(
  userId: string,
  role: string,
  milestoneId: string,
  input: SubmitMilestoneInput,
) {
  const milestone = await loadContractMilestone(milestoneId);
  if (milestone.contract!.freelancerId !== userId && role !== "admin")
    throw apiError("Only the assigned freelancer can submit", 403, "FORBIDDEN");
  if (milestone.status !== "funded")
    throw apiError(
      "Only funded milestones can be submitted",
      400,
      "INVALID_STATE",
    );
  const updated = await prisma.milestone.update({
    where: { id: milestoneId },
    data: {
      status: "submitted",
      deliverables: input.deliverables,
      submissionNote: input.note || null,
      submittedAt: new Date(),
    },
  });
  await logActivity(userId, "milestone.submitted", "Milestone", milestoneId, {
    contractId: milestone.contractId,
    deliverables: input.deliverables.length,
  });
  await notifyUser(milestone.contract!.clientId, {
    type: "milestone.submitted",
    title: "Work submitted for review",
    message: "The freelancer submitted deliverables for your review",
    entity: "Milestone",
    entityId: milestoneId,
    data: { milestoneId, contractId: milestone.contractId },
  });
  return updated;
}

// Client flags a problem — freezes release until resolved (resolution is a follow-up)
export async function disputeMilestoneService(
  userId: string,
  role: string,
  milestoneId: string,
  reason?: string,
) {
  const milestone = await loadContractMilestone(milestoneId);
  if (milestone.contract!.clientId !== userId && role !== "admin")
    throw apiError("Only the client can dispute", 403, "FORBIDDEN");
  if (milestone.status !== "funded" && milestone.status !== "submitted")
    throw apiError(
      "Only funded or submitted milestones can be disputed",
      400,
      "INVALID_STATE",
    );
  const updated = await prisma.milestone.update({
    where: { id: milestoneId },
    data: { status: "disputed" },
  });
  await logActivity(userId, "milestone.disputed", "Milestone", milestoneId, {
    contractId: milestone.contractId,
    reason: reason || null,
  });
  await notifyUser(milestone.contract!.freelancerId, {
    type: "milestone.disputed",
    title: "Milestone disputed",
    message: "The client flagged an issue with a milestone",
    entity: "Milestone",
    entityId: milestoneId,
    data: { milestoneId, contractId: milestone.contractId },
  });
  return updated;
}

// Client approves submitted work — transfers net escrow to freelancer Connect (idempotent)
export async function approveReleaseMilestoneService(
  userId: string,
  role: string,
  milestoneId: string,
) {
  const milestone = await loadContractMilestone(milestoneId);
  if (milestone.contract!.clientId !== userId && role !== "admin")
    throw apiError("Only the client can approve", 403, "FORBIDDEN");
  if (milestone.status !== "submitted")
    throw apiError(
      "Only submitted milestones can be approved",
      400,
      "INVALID_STATE",
    );
  const freelancer = await prisma.user.findUnique({
    where: { id: milestone.contract!.freelancerId },
  });
  if (!freelancer?.stripeAccountId)
    throw apiError(
      "Freelancer hasn't connected payouts yet",
      400,
      "FREELANCER_NOT_ONBOARDED",
    );
  if (!milestone.stripePaymentIntentId)
    throw apiError(
      "No captured payment behind this milestone",
      400,
      "NO_PAYMENT",
    );

  const pi = await stripe.paymentIntents.retrieve(
    milestone.stripePaymentIntentId,
  );
  const chargeId =
    typeof pi.latest_charge === "string"
      ? pi.latest_charge
      : pi.latest_charge?.id;
  const { freelancerReceives, fee, feePercent } = quoteEscrow(milestone.amount);
  let transferId: string;
  try {
    const transfer = await stripe.transfers.create(
      {
        amount: freelancerReceives,
        currency: ESCROW_CURRENCY,
        destination: freelancer.stripeAccountId,
        source_transaction: chargeId,
        metadata: {
          milestoneId: milestone.id,
          contractId: milestone.contractId!,
          purpose: "milestone_release",
        },
      },
      { idempotencyKey: `milestone-release-${milestone.id}` },
    );
    transferId = transfer.id;
  } catch (err) {
    throw apiError(
      (err as Error).message ?? "Transfer failed — escrow untouched",
      502,
      "TRANSFER_FAILED",
    );
  }
  const updated = await prisma.milestone.update({
    where: { id: milestoneId },
    data: { status: "released" },
  });
  await logActivity(userId, "milestone.approved", "Milestone", milestoneId, {
    contractId: milestone.contractId,
    transferId,
    fee,
  });
  await notifyUser(milestone.contract!.freelancerId, {
    type: "milestone.released",
    title: "Funds released",
    message: "The client approved the milestone — payout is on its way",
    entity: "Milestone",
    entityId: milestoneId,
    data: {
      milestoneId,
      contractId: milestone.contractId,
      amount: freelancerReceives,
    },
  });
  await notifyUser(milestone.contract!.clientId, {
    type: "milestone.released",
    title: "Milestone approved",
    message: "Escrow released to the freelancer",
    entity: "Milestone",
    entityId: milestoneId,
    data: { milestoneId, contractId: milestone.contractId, feePercent },
  });
  return { milestone: updated, transferId, fee, feePercent };
}
