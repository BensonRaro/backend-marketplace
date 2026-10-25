// Stripe verification helpers — shared by connect (freelancer) + customer (client) services
import { prisma } from "./prisma.js";

export function apiError(msg: string, status: number, code: string) {
  const e = new Error(msg) as Error & { status?: number; code?: string };
  e.status = status;
  e.code = code;
  return e;
}

// Normalize Stripe Connect account shape (v2 vs v1) into verification flags
export function extractConnectVerification(acct: unknown) {
  const a = acct as Record<string, unknown>;
  // v1 snapshot shape (fallback retrieve path) — legacy flags are authoritative there
  if (
    typeof a.charges_enabled === "boolean" ||
    typeof a.payouts_enabled === "boolean" ||
    typeof a.details_submitted === "boolean"
  ) {
    const detailsSubmitted = !!(
      a.details_submitted ??
      (a.requirements as Record<string, unknown> | undefined)?.details_submitted
    );
    const chargesEnabled = !!a.charges_enabled;
    const payoutsEnabled = !!a.payouts_enabled;
    const req = a.requirements as
      { currently_due?: string[]; eventually_due?: string[] } | undefined;
    const noDue =
      !req ||
      (req.currently_due?.length === 0 && req.eventually_due?.length === 0);
    return {
      detailsSubmitted,
      chargesEnabled,
      payoutsEnabled,
      verified: chargesEnabled && payoutsEnabled && (detailsSubmitted || noDue),
    };
  }
  // v2 shape — capability statuses only (per stripe-best-practices, never v1 flags)
  const cfg = a.configuration as
    | {
        recipient?: {
          capabilities?: {
            stripe_balance?: {
              stripe_transfers?: { status?: string };
              payouts?: { status?: string };
            };
          };
        };
        merchant?: { capabilities?: { card_payments?: { status?: string } } };
      }
    | undefined;
  const transfers =
    cfg?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status;
  const payouts = cfg?.recipient?.capabilities?.stripe_balance?.payouts?.status;
  const payoutsEnabled = transfers === "active" || payouts === "active";
  const chargesEnabled =
    cfg?.merchant?.capabilities?.card_payments?.status === "active";
  // v2 requirements come as entries[] with minimum_deadline.status — only currently_due blocks
  const req = a.requirements as
    | {
        entries?: { minimum_deadline?: { status?: string } }[];
        currently_due?: string[];
      }
    | undefined;
  const blocked =
    (req?.entries ?? []).some(
      (e) => e?.minimum_deadline?.status === "currently_due",
    ) || (req?.currently_due?.length ?? 0) > 0;
  const detailsSubmitted = !blocked;
  // Freelancer escrow needs payouts only — platform (not the account) charges cards
  return {
    detailsSubmitted,
    chargesEnabled,
    payoutsEnabled,
    verified: payoutsEnabled && detailsSubmitted,
  };
}

// Write an activity-log row — best-effort, never throws
export async function logActivity(
  actorId: string | null,
  action: string,
  entity: string,
  entityId: string,
  after?: unknown,
) {
  try {
    await prisma.activityLog.create({
      data: { actorId, action, entity, entityId, after: after as never },
    });
  } catch (err) {
    console.warn("[activity] log failed", (err as Error).message);
  }
}
