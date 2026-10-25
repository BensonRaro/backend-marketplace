// Stripe webhook — verifies signature with raw body, syncs freelancer + client verification
import { Router } from "express";
import { STRIPE_WEBHOOK_SECRETS } from "../lib/stripe.js";
import {
  verifyWebhook,
  describeVerifyFailure,
} from "../lib/stripe-webhook-verify.js";
import {
  handleStripeWebhookEvent,
  handleThinNotification,
} from "../services/stripe-webhook.service.js";

const router = Router();

// Must use raw body for signature verification — mounted before json parser in server.ts for this path
router.post("/stripe", async (req, res) => {
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig || !STRIPE_WEBHOOK_SECRETS.length) {
    console.warn("[webhook] missing signature or secret");
    res
      .status(400)
      .json({ error: { code: "BAD_REQUEST", message: "Missing signature" } });
    return;
  }

  // req.body is Buffer when using express.raw — anything else means the
  // raw parser didn't run, and re-serializing would break the signature anyway
  const rawBody = (req as unknown as { body: Buffer }).body;
  if (!Buffer.isBuffer(rawBody)) {
    console.error(
      "[webhook] body is not a Buffer — raw parser missing, content-type:",
      req.headers["content-type"],
    );
    res
      .status(400)
      .json({
        error: { code: "INVALID_PAYLOAD", message: "Webhook needs raw body" },
      });
    return;
  }

  const verified = await verifyWebhook(rawBody, sig);
  if (!verified) {
    console.error(
      "[webhook] signature verify failed — no configured secret matched",
      describeVerifyFailure(rawBody, sig),
    );
    res
      .status(400)
      .json({
        error: {
          code: "INVALID_SIGNATURE",
          message:
            "Webhook Error: No signatures found matching the expected signature for payload.",
        },
      });
    return;
  }

  try {
    if (verified.kind === "notification")
      await handleThinNotification(verified.notification);
    else await handleStripeWebhookEvent(verified.event);
    res.json({ received: true });
  } catch (err) {
    console.error("[webhook] handler error", err);
    res
      .status(500)
      .json({
        error: { code: "HANDLER_ERROR", message: "Webhook handler failed" },
      });
  }
});

export default router;
