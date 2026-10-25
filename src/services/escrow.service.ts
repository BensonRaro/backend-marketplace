// Escrow funding — client charges held on platform, transferred on release (separate charges & transfers)
import crypto from "node:crypto";
import type Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { stripe, FRONTEND_URL } from "../lib/stripe.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import { notifyUser } from "../lib/notify.js";

export const ESCROW_CURRENCY = "usd";

// Platform fee % — applied at release (transfer = charge minus fee), quoted at fund time
export function platformFeePercent() {
  const n = Number(process.env.PLATFORM_FEE_PERCENT ?? 10);
  return Number.isFinite(n) && n >= 0 && n <= 90 ? n : 10;
}

// Pure fee quote in cents — freelancer receives charge minus platform cut
export function quoteEscrow(amountCents: number, feePercent = platformFeePercent()) {
  const fee = Math.round((amountCents * feePercent) / 100);
  return { amount: amountCents, feePercent, fee, freelancerReceives: amountCents - fee };
}

// Owner-only: create a payment-mode Checkout session holding milestone funds on the platform
export async function createMilestoneFundService(userId: string, milestoneId: string) {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    include: { job: { select: { id: true, title: true, clientId: true, escrowStatus: true, contract: { select: { id: true } } } }, contract: { select: { id: true, clientId: true, job: { select: { id: true, title: true, escrowStatus: true } } } } },
  });
  if (!milestone) throw apiError("Milestone not found", 404, "NOT_FOUND");
  // Works for job milestones (pre-hire) and contract milestones (post-hire)
  const ownerId = milestone.job?.clientId ?? milestone.contract?.clientId;
  const contextTitle = milestone.job?.title ?? milestone.contract?.job.title ?? milestone.title;
  const contextJobId = milestone.job?.id ?? milestone.contract?.job.id ?? "";
  if (!ownerId) throw apiError("Milestone not found", 404, "NOT_FOUND");
  // Stranded pre-hire funding can't repeat — contracted jobs fund on the contract
  if (milestone.job?.contract) throw apiError("Job is contracted — fund milestones on the contract instead", 400, "HAS_CONTRACT");
  // Whole-funded work takes no further funding rounds
  if ((milestone.job?.escrowStatus ?? milestone.contract?.job.escrowStatus) === "funded") throw apiError("Job is fully funded — no more funding needed", 400, "JOB_FUNDED");
  const client = await prisma.user.findUnique({ where: { id: userId } });
  if (!client) throw apiError("User not found", 404, "NOT_FOUND");
  if (ownerId !== userId && client.role !== "admin") throw apiError("Only the job owner can fund", 403, "FORBIDDEN");
  if (!client.stripePaymentVerified && client.role !== "admin") throw apiError("Verify a payment card first — visit /verify-stripe", 403, "VERIFICATION_REQUIRED");
  if (milestone.status !== "unfunded") throw apiError("Milestone already funded", 400, "ALREADY_FUNDED");

  let customerId = client.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: client.email ?? undefined, name: client.name ?? undefined, metadata: { userId } });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: ESCROW_CURRENCY,
    customer: customerId,
    line_items: [{ price_data: { currency: ESCROW_CURRENCY, unit_amount: milestone.amount, product_data: { name: `Escrow: ${contextTitle.slice(0, 60)}`, description: `Milestone: ${milestone.title}`.slice(0, 200) } }, quantity: 1 }],
    success_url: `${FRONTEND_URL}/dashboard/client/jobs?funded=true&milestone=${milestone.id}`,
    cancel_url: `${FRONTEND_URL}/dashboard/client/jobs?funding=cancelled`,
    metadata: { purpose: "milestone_funding", milestoneId: milestone.id, jobId: contextJobId, contractId: milestone.contractId ?? "", userId },
    integration_identifier: `talentHive-escrow-${randomLetters(8)}`,
  });
  if (!session.url) throw apiError("Failed to create funding session", 500, "STRIPE_ERROR");
  await prisma.milestone.update({ where: { id: milestone.id }, data: { stripeCheckoutSessionId: session.id } });
  return { url: session.url, milestoneId: milestone.id, quote: quoteEscrow(milestone.amount) };
}

// Webhook source of truth — trust only when Stripe amount/currency match the milestone
export async function syncMilestoneFundingService(s: Stripe.Checkout.Session) {
  const milestoneId = s.metadata?.milestoneId;
  if (!milestoneId) return;
  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId }, include: { job: { select: { clientId: true } }, contract: { select: { clientId: true } } } });
  if (!milestone || milestone.status === "funded") return; // idempotent
  if (s.amount_total !== milestone.amount || (s.currency ?? "").toLowerCase() !== ESCROW_CURRENCY) {
    console.warn(`[webhook] milestone amount mismatch ${milestoneId}: expected ${milestone.amount} usd, got ${s.amount_total} ${s.currency}`);
    return;
  }
  const paymentIntentId = (s.payment_intent as string) ?? null;
  await prisma.milestone.update({ where: { id: milestoneId }, data: { status: "funded", stripePaymentIntentId: paymentIntentId, stripeCheckoutSessionId: s.id } });
  await logActivity(s.metadata?.userId ?? null, "milestone.funded", "Milestone", milestoneId, { amount: milestone.amount, paymentIntentId });
  await notifyUser(milestone.job?.clientId ?? milestone.contract?.clientId, {
    type: "milestone.funded",
    title: "Milestone funded",
    message: `Escrow locked for a milestone ($${(milestone.amount / 100).toFixed(2)})`,
    entity: "Milestone",
    entityId: milestoneId,
    data: { milestoneId, jobId: milestone.jobId, amount: milestone.amount },
  });
  console.log(`[webhook] milestone funded ${milestoneId} ($${(milestone.amount / 100).toFixed(2)})`);
}

function randomLetters(n: number) {
  const alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from(crypto.randomBytes(n), (b) => alpha[b % alpha.length]).join("");
}
