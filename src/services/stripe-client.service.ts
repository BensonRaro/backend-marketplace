// Client payment verification — Stripe Customer + Setup Checkout (card to fund escrow)
import { prisma } from "../lib/prisma.js";
import { stripe, FRONTEND_URL } from "../lib/stripe.js";
import { apiError, logActivity } from "../lib/stripe-verify.js";

// Status for the logged-in client — verified = saved card on file
export async function getClientPaymentStatusService(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, stripeCustomerId: true, stripeCardBrand: true, stripeCardLast4: true, stripePaymentVerified: true, stripePaymentVerifiedAt: true },
  });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (user.role !== "client" && user.role !== "admin") throw apiError("Client verification is for clients only", 403, "FORBIDDEN");
  return user;
}

// Create (or reuse) Customer + Setup-mode Checkout Session for saving a card
export async function createClientSetupService(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (user.role !== "client" && user.role !== "admin") throw apiError("Only clients verify a payment method", 403, "FORBIDDEN");

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email ?? undefined, name: user.name ?? undefined, metadata: { userId } });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    currency: "usd", // required by Stripe even in setup mode; matches escrow currency
    customer: customerId,
    success_url: `${FRONTEND_URL}/verify-stripe?success=true`,
    cancel_url: `${FRONTEND_URL}/verify-stripe?refresh=true`,
    metadata: { userId, purpose: "client_verification" },
  });
  if (!session.url) throw apiError("Failed to create card setup session", 500, "STRIPE_ERROR");
  return { customerId, url: session.url };
}

// Manual re-sync after returning from Checkout (webhook is source of truth)
export async function syncClientPaymentService(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.stripeCustomerId) return { verified: false };
  const methods = await stripe.customers.listPaymentMethods(user.stripeCustomerId, { limit: 1 });
  const pm = methods.data[0];
  if (!pm?.card) return { verified: false };
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { stripePaymentMethodId: pm.id, stripeCardBrand: pm.card.brand ?? null, stripeCardLast4: pm.card.last4 ?? null, stripePaymentVerified: true, stripePaymentVerifiedAt: new Date() },
  });
  await logActivity(userId, "client.verified", "User", userId, { brand: pm.card.brand, last4: pm.card.last4 });
  return { verified: true, brand: updated.stripeCardBrand, last4: updated.stripeCardLast4 };
}
