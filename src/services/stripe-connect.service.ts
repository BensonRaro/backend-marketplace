// Freelancer Stripe Connect service — payouts only (freelancer role enforced)
import { prisma } from "../lib/prisma.js";
import { stripe, FRONTEND_URL } from "../lib/stripe.js";
import { apiError, extractConnectVerification, logActivity } from "../lib/stripe-verify.js";

const STATUS_SELECT = {
  id: true, email: true, role: true, stripeAccountId: true,
  stripeDetailsSubmitted: true, stripeChargesEnabled: true,
  stripePayoutsEnabled: true, stripeVerified: true, stripeVerifiedAt: true,
} as const;

// Live-sync Connect flags from Stripe, persist + return status
export async function getConnectStatusService(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: STATUS_SELECT });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (user.role !== "freelancer" && user.role !== "admin") throw apiError("Connect onboarding is for freelancers only", 403, "FORBIDDEN");

  if (user.stripeAccountId) {
    try {
      let acct: unknown;
      try {
        const v2 = (stripe as unknown as { v2: { core: { accounts: { retrieve: (id: string, o?: unknown) => Promise<unknown> } } } }).v2.core.accounts;
        acct = await v2.retrieve(user.stripeAccountId, { include: ["configuration.merchant", "configuration.recipient", "requirements"] });
      } catch {
        acct = await stripe.accounts.retrieve(user.stripeAccountId);
      }
      const v = extractConnectVerification(acct);
      if (v.detailsSubmitted !== user.stripeDetailsSubmitted || v.chargesEnabled !== user.stripeChargesEnabled || v.payoutsEnabled !== user.stripePayoutsEnabled || v.verified !== user.stripeVerified) {
        await prisma.user.update({ where: { id: userId }, data: { stripeDetailsSubmitted: v.detailsSubmitted, stripeChargesEnabled: v.chargesEnabled, stripePayoutsEnabled: v.payoutsEnabled, stripeVerified: v.verified, stripeVerifiedAt: v.verified ? new Date() : null } });
        if (v.verified && !user.stripeVerified) await logActivity(userId, "freelancer.verified", "User", userId, { stripeAccountId: user.stripeAccountId });
        return { ...user, ...v, stripeVerified: v.verified, stripeVerifiedAt: v.verified ? new Date() : null };
      }
    } catch (err) {
      console.warn("[stripe] retrieve failed", (err as Error).message);
    }
  }
  return user;
}

// Create Connect account (recipient/payouts) + onboarding link — freelancer only
export async function createConnectOnboardingService(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (user.role !== "freelancer" && user.role !== "admin") throw apiError("Only freelancers can connect payouts — clients verify a card instead", 403, "FORBIDDEN");

  let accountId = user.stripeAccountId;
  if (!accountId) {
    const v2Create = (stripe as unknown as { v2: { core: { accounts: { create: (p: unknown) => Promise<{ id: string }> } } } }).v2.core.accounts.create.bind(
      (stripe as unknown as { v2: { core: { accounts: unknown } } }).v2.core.accounts,
    );
    const base = {
      contact_email: user.email ?? undefined,
      display_name: user.name ?? user.email ?? "TalentHive Freelancer",
      identity: { country: "US", entity_type: "individual" as const },
      dashboard: "express" as const,
      // Required by Stripe when requesting merchant/recipient capabilities — platform owns pricing + losses
      defaults: { currency: "usd" as const, responsibilities: { fees_collector: "application" as const, losses_collector: "application" as const }, locales: ["en-US"] },
      metadata: { userId },
      include: ["configuration.recipient", "identity", "requirements"],
    };
    const candidates: Record<string, unknown>[] = [
      { ...base, configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } } },
      { ...base, configuration: { merchant: { capabilities: { card_payments: { requested: true } } }, recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } } },
    ];
    let lastErr: unknown = null;
    for (const payload of candidates) {
      try {
        const account = await v2Create(payload as unknown as object);
        accountId = account.id;
        await prisma.user.update({ where: { id: userId }, data: { stripeAccountId: accountId } });
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg = (err as { message?: string })?.message ?? String(err);
        console.warn(`[stripe] v2 create failed: ${msg}`);
        if (!msg.includes("account configuration is not supported")) break;
      }
    }
    if (!accountId) throw apiError((lastErr as { message?: string })?.message ?? "Connect not enabled for this platform", 400, "STRIPE_CONFIG_UNSUPPORTED");
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${FRONTEND_URL}/verify-stripe?refresh=true`,
    return_url: `${FRONTEND_URL}/verify-stripe?success=true`,
    type: "account_onboarding",
  });
  return { accountId, url: link.url };
}
