// Stripe webhook signature verification — tries every configured secret (endpoint + CLI/rotation)
import type Stripe from "stripe";
import { stripe, STRIPE_WEBHOOK_SECRETS } from "./stripe.js";

export type VerifiedWebhook =
  | { kind: "event"; event: Stripe.Event }
  | { kind: "notification"; notification: Stripe.V2.Core.EventNotification };

// v2 thin-event payloads are rejected by the snapshot verifier — detect and reroute
function isThinEventError(err: unknown) {
  return ((err as Error)?.message ?? "").includes("thin event notification");
}

// Snapshot first, then thin per secret — first success wins
export async function verifyWebhook(
  payload: Buffer,
  sig: string,
): Promise<VerifiedWebhook | null> {
  for (const secret of STRIPE_WEBHOOK_SECRETS) {
    try {
      // NOTE: async verify — Bun's SDK only supports SubtleCrypto (sync constructEvent always throws)
      const event = await stripe.webhooks.constructEventAsync(
        payload,
        sig,
        secret,
      );
      return { kind: "event", event };
    } catch (err) {
      if (!isThinEventError(err)) continue;
      try {
        const notification = await stripe.parseEventNotificationAsync(
          payload,
          sig,
          secret,
        );
        return { kind: "notification", notification };
      } catch {
        continue;
      }
    }
  }
  return null;
}

// One-line failure diagnosis: sig age catches clock skew/replays (tolerance 300s),
// secrets_tried catches a stale .env, bytes catches body-mangling proxies
export function describeVerifyFailure(
  payload: Buffer,
  sig: string,
): string {
  return `(event:${peekEventType(payload)} sig_age:${signatureAgeSec(sig) ?? "?"}s secrets_tried:${STRIPE_WEBHOOK_SECRETS.length} bytes:${payload.length})`;
}

// Seconds since Stripe signed — null when the header has no timestamp
function signatureAgeSec(sig: string): number | null {
  const t = /t=(\d+)/.exec(sig)?.[1];
  if (!t) return null;
  return Math.round(Date.now() / 1000 - Number(t));
}

// Best-effort envelope peek — type fields only, no verification, no PII
function peekEventType(payload: Buffer): string {
  try {
    const o = JSON.parse(payload.toString("utf8")) as {
      object?: unknown;
      type?: unknown;
    };
    return `${String(o.object ?? "?")}:${String(o.type ?? "?")}`;
  } catch {
    return "unparseable";
  }
}
