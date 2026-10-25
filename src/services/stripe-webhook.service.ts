// Stripe webhook dispatcher — Connect (freelancer) + Setup Checkout (client) + escrow funding
import type Stripe from "stripe";
import { prisma } from "../lib/prisma.js";
import { stripe } from "../lib/stripe.js";
import {
  extractConnectVerification,
  logActivity,
} from "../lib/stripe-verify.js";
import { notifyUser } from "../lib/notify.js";
import { syncMilestoneFundingService } from "./escrow.service.js";
import { syncJobFundingService } from "./job-fund.service.js";

// Sync Connect account verification after account.updated events
async function syncConnectAccount(accountId: string, eventType: string) {
  let acct: unknown;
  try {
    const v2 = (
      stripe as unknown as {
        v2: {
          core: {
            accounts: {
              retrieve: (id: string, o?: unknown) => Promise<unknown>;
            };
          };
        };
      }
    ).v2.core.accounts;
    acct = await v2.retrieve(accountId, {
      include: [
        "configuration.merchant",
        "configuration.recipient",
        "requirements",
      ],
    });
  } catch {
    acct = await stripe.accounts.retrieve(accountId);
  }
  const v = extractConnectVerification(acct);
  const user = await prisma.user.findFirst({
    where: { stripeAccountId: accountId },
  });
  if (!user) return;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeDetailsSubmitted: v.detailsSubmitted,
      stripeChargesEnabled: v.chargesEnabled,
      stripePayoutsEnabled: v.payoutsEnabled,
      stripeVerified: v.verified,
      stripeVerifiedAt: v.verified ? new Date() : null,
    },
  });
  if (v.verified && !user.stripeVerified)
    await logActivity(user.id, "freelancer.verified", "User", user.id, {
      accountId,
    });
  if (v.verified && !user.stripeVerified)
    await notifyUser(user.id, {
      type: "freelancer.verified",
      title: "Payouts verified",
      message: "Your Stripe Connect account is ready to receive payouts",
      entity: "User",
      entityId: user.id,
      data: { accountId },
    });
  console.log(
    `[webhook] freelancer ${user.email} -> ${v.verified} (${eventType})`,
  );
}

// Mark client verified from a Setup session — amount-agnostic, card-only
async function syncClientFromSetup(checkout: Stripe.Checkout.Session) {
  const userId = checkout.metadata?.userId;
  const customerId = (checkout.customer as string) ?? null;
  if (!userId || !customerId) return;
  const setupIntentId = checkout.setup_intent as string | null;
  let pmId: string | null = null;
  if (setupIntentId) {
    const si = await stripe.setupIntents.retrieve(setupIntentId, {
      expand: ["payment_method"],
    });
    pmId =
      (si.payment_method as Stripe.PaymentMethod)?.id ??
      (si.payment_method as string) ??
      null;
  }
  if (!pmId) {
    const methods = await stripe.customers.listPaymentMethods(customerId, {
      limit: 1,
    });
    pmId = methods.data[0]?.id ?? null;
  }
  if (!pmId) return;
  const pm = await stripe.paymentMethods.retrieve(pmId);
  await prisma.user.update({
    where: { id: userId },
    data: {
      stripeCustomerId: customerId,
      stripePaymentMethodId: pm.id,
      stripeCardBrand: pm.card?.brand ?? null,
      stripeCardLast4: pm.card?.last4 ?? null,
      stripePaymentVerified: true,
      stripePaymentVerifiedAt: new Date(),
    },
  });
  await logActivity(userId, "client.verified", "User", userId, {
    brand: pm.card?.brand,
    last4: pm.card?.last4,
  });
  await notifyUser(userId, {
    type: "client.verified",
    title: "Payment method verified",
    message: `Card verified (${pm.card?.brand ?? "card"} •• ${pm.card?.last4 ?? ""}) — you can fund work`,
    entity: "User",
    entityId: userId,
    data: {
      brand: pm.card?.brand,
      last4: pm.card?.last4,
    },
  });
  console.log(
    `[webhook] client verified ${userId} (${pm.card?.brand} •• ${pm.card?.last4})`,
  );
}

export async function handleStripeWebhookEvent(event: Stripe.Event) {
  const type = event.type as string;
  // Freelancer Connect updates
  if (
    type === "account.updated" ||
    type === "v2.core.account.updated" ||
    type === "v2.core.account.created"
  ) {
    const accountId = type.startsWith("v2.core.account")
      ? (event.data.object as { id?: string }).id
      : (event.data.object as Stripe.Account).id;
    if (accountId)
      await syncConnectAccount(accountId, type).catch((e) =>
        console.warn("[webhook] connect sync failed", (e as Error).message),
      );
    return;
  }
  // Client card-saved flows (webhook is source of truth — never trust return URL alone)
  if (
    type === "checkout.session.completed" ||
    type === "checkout.session.async_payment_succeeded"
  ) {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.mode === "setup" && s.payment_status !== "unpaid")
      await syncClientFromSetup(s).catch((e) =>
        console.warn("[webhook] client sync failed", (e as Error).message),
      );
    // Escrow funding — amount/currency verified inside before marking funded
    if (s.mode === "payment" && s.payment_status !== "unpaid") {
      if (s.metadata?.purpose === "milestone_funding") {
        await syncMilestoneFundingService(s).catch((e) =>
          console.warn("[webhook] escrow sync failed", (e as Error).message),
        );
      } else if (s.metadata?.purpose === "job_funding") {
        await syncJobFundingService(s).catch((e) =>
          console.warn("[webhook] job sync failed", (e as Error).message),
        );
      }
    }
    return;
  }
  if (type === "setup_intent.succeeded") {
    const si = event.data.object as Stripe.SetupIntent;
    const userId = si.metadata?.userId;
    if (userId && si.customer)
      await syncClientFromSetup({
        metadata: { userId },
        customer: si.customer as string,
        setup_intent: si.id,
      } as unknown as Stripe.Checkout.Session).catch(() => {});
    return;
  }
  console.log(`[webhook] unhandled ${type}`);
}

// Thin-event (v2) notifications — carry related_object ids, not snapshots.
// We re-fetch canonical state from Stripe, so no snapshot is needed.
export async function handleThinNotification(
  n: Stripe.V2.Core.EventNotification,
) {
  const type = n.type as string;
  if (type.startsWith("v2.core.account")) {
    // related_object isn't on every union member — read structurally
    const accountId = (
      n as unknown as { related_object?: { id?: string } | null }
    ).related_object?.id;
    if (!accountId) {
      console.log(`[webhook] thin ${type} without related object`);
      return;
    }
    await syncConnectAccount(accountId, type).catch((e) =>
      console.warn("[webhook] connect sync failed", (e as Error).message),
    );
    return;
  }
  console.log(`[webhook] unhandled thin ${type}`);
}
