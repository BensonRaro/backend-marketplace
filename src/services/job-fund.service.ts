// Whole-job escrow funding — one Checkout charge for fixed jobs (hourly funds per milestone)
import crypto from "node:crypto";
import type Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { stripe, FRONTEND_URL } from "../lib/stripe.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";
import { notifyUser } from "../lib/notify.js";
import { ESCROW_CURRENCY, quoteEscrow } from "./escrow.service.js";

// Owner-only: fund the entire fixed budget in one Checkout session (platform holds)
export async function createJobFundService(userId: string, jobId: string) {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId }, include: { contract: { select: { id: true } } } });
  if (!job) throw apiError("Job not found", 404, "NOT_FOUND");
  const client = await prisma.user.findUnique({ where: { id: userId } });
  if (!client) throw apiError("User not found", 404, "NOT_FOUND");
  if (job.clientId !== userId && client.role !== "admin") throw apiError("Only the job owner can fund", 403, "FORBIDDEN");
  if (!client.stripePaymentVerified && client.role !== "admin") throw apiError("Verify a payment card first — visit /verify-stripe", 403, "VERIFICATION_REQUIRED");
  if (job.budgetType !== "fixed") throw apiError("Hourly jobs fund per milestone, not as a whole", 400, "HOURLY_JOB");
  if (job.contract) throw apiError("Job is contracted — fund milestones on the contract instead", 400, "HAS_CONTRACT");
  if (job.escrowStatus === "funded") throw apiError("Job already funded", 400, "ALREADY_FUNDED");

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
    line_items: [{ price_data: { currency: ESCROW_CURRENCY, unit_amount: job.budget, product_data: { name: `Escrow: ${job.title.slice(0, 60)}`, description: "Full project funding".slice(0, 200) } }, quantity: 1 }],
    success_url: `${FRONTEND_URL}/dashboard/client/jobs?funded=true&job=${job.id}`,
    cancel_url: `${FRONTEND_URL}/dashboard/client/jobs?funding=cancelled`,
    metadata: { purpose: "job_funding", jobId: job.id, userId },
    integration_identifier: `talentHive-escrow-${randomLetters(8)}`,
  });
  if (!session.url) throw apiError("Failed to create funding session", 500, "STRIPE_ERROR");
  await prisma.jobPosting.update({ where: { id: job.id }, data: { stripeCheckoutSessionId: session.id } });
  return { url: session.url, jobId: job.id, quote: quoteEscrow(job.budget) };
}

// Webhook source of truth — trust only when Stripe amount/currency match the budget
export async function syncJobFundingService(s: Stripe.Checkout.Session) {
  const jobId = s.metadata?.jobId;
  if (!jobId) return;
  const job = await prisma.jobPosting.findUnique({ where: { id: jobId } });
  if (!job || job.escrowStatus === "funded") return; // idempotent
  if (s.amount_total !== job.budget || (s.currency ?? "").toLowerCase() !== ESCROW_CURRENCY) {
    console.warn(`[webhook] job amount mismatch ${jobId}: expected ${job.budget} usd, got ${s.amount_total} ${s.currency}`);
    return;
  }
  const paymentIntentId = (s.payment_intent as string) ?? null;
  await prisma.jobPosting.update({ where: { id: jobId }, data: { escrowStatus: "funded", stripePaymentIntentId: paymentIntentId, stripeCheckoutSessionId: s.id, fundedAt: new Date() } });
  await logActivity(s.metadata?.userId ?? null, "job.funded", "JobPosting", jobId, { amount: job.budget, paymentIntentId });
  await notifyUser(job.clientId, {
    type: "job.funded",
    title: "Job funded",
    message: `"${job.title}" is funded — freelancers can now bid`,
    entity: "JobPosting",
    entityId: jobId,
    data: { jobId, amount: job.budget },
  });
  console.log(`[webhook] job funded ${jobId} ($${(job.budget / 100).toFixed(2)})`);
}

function randomLetters(n: number) {
  const alpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from(crypto.randomBytes(n), (b) => alpha[b % alpha.length]).join("");
}
