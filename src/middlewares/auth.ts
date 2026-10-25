// Auth helpers — session retrieval + route protection via Auth.js (Express)
import { getSession } from "@auth/express";
import type { Request, Response, NextFunction } from "express";
import { authConfig } from "../lib/auth.js";

// Attach session to res.locals for every request (optional, lightweight)
export async function attachSession(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.locals.session = await getSession(req, authConfig);
  } catch {
    res.locals.session = null;
  }
  next();
}

// Protect routes — requires valid session, otherwise 401 with AGENTS error shape
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const session = res.locals.session ?? (await getSession(req, authConfig));
  if (!session?.user) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });
    return;
  }
  // expose session for downstream handlers
  res.locals.session = session;
  next();
}

// Require onboarding completed — admin bypassed, others must have onboardingCompleted=true
export async function requireOnboarding(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const session = res.locals.session;
  if (!session?.user) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const u = session.user as unknown as { role?: string; onboardingCompleted?: boolean };
  if (u.role === "admin") {
    next();
    return;
  }
  if (!u.onboardingCompleted) {
    res.status(403).json({ error: { code: "ONBOARDING_REQUIRED", message: "Please complete onboarding" } });
    return;
  }
  next();
}

// Require Stripe verification — role-aware: client pays (card), freelancer receives (Connect), admin bypassed
export async function requireVerified(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const session = res.locals.session;
  if (!session?.user) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  const u = session.user as unknown as { role?: string; stripeVerified?: boolean; stripePaymentVerified?: boolean };
  if (u.role === "admin") {
    next();
    return;
  }
  const ok = u.role === "client" ? u.stripePaymentVerified : u.role === "freelancer" ? u.stripeVerified : false;
  if (!ok) {
    const msg = u.role === "client" ? "Verify a payment card to continue — visit /verify-stripe" : "Verify with Stripe Connect to continue — visit /verify-stripe";
    res.status(403).json({ error: { code: "VERIFICATION_REQUIRED", message: msg } });
    return;
  }
  next();
}
