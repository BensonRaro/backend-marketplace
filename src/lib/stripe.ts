// Stripe lib — single client, latest API version 2026-08-26.dahlia (per stripe-best-practices)
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("[stripe] STRIPE_SECRET_KEY not set — Stripe calls will fail");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder", {
  apiVersion: "2026-08-26.dahlia" as unknown as Stripe.LatestApiVersion, // use latest, fallback if type lags
  typescript: true,
});

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
// Single signer — the Dashboard endpoint's signing secret (rotate by replacing this value)
export const STRIPE_WEBHOOK_SECRETS = [STRIPE_WEBHOOK_SECRET].filter(Boolean);
// Safe fingerprint (last 4 only) — compare with Dashboard output to spot a stale .env
const fingerprints = STRIPE_WEBHOOK_SECRETS.map(
  (s) => `whsec_…${s.slice(-4)}`,
).join(", ");
console.log(
  `[stripe] webhook secrets configured: ${STRIPE_WEBHOOK_SECRETS.length} (${fingerprints || "none"})`,
);
export const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173";
