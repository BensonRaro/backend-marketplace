// Role + verification guards — client pays (card), freelancer receives (Connect)
import type { Request, Response, NextFunction } from "express";

type Role = "client" | "freelancer" | "admin";
type SessionUser = { role?: Role; stripeVerified?: boolean; stripePaymentVerified?: boolean };

// Allow only listed roles (admin bypasses when included or via separate check)
export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const u = res.locals.session?.user as SessionUser | undefined;
    if (!u) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
      return;
    }
    if (!u.role || !roles.includes(u.role)) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: `Requires role: ${roles.join(", ")}` } });
      return;
    }
    next();
  };
}

// Client must have a saved card (to fund escrow) — admin bypassed
export function requireClientVerified(_req: Request, res: Response, next: NextFunction) {
  const u = res.locals.session?.user as SessionUser | undefined;
  if (!u) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  if (u.role === "admin") {
    next();
    return;
  }
  if (!u.stripePaymentVerified) {
    res.status(403).json({ error: { code: "VERIFICATION_REQUIRED", message: "Verify a payment card to continue — visit /verify-stripe" } });
    return;
  }
  next();
}

// Freelancer must have Connect payouts enabled (to receive escrow) — admin bypassed
export function requireFreelancerVerified(_req: Request, res: Response, next: NextFunction) {
  const u = res.locals.session?.user as SessionUser | undefined;
  if (!u) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  if (u.role === "admin") {
    next();
    return;
  }
  if (!u.stripeVerified) {
    res.status(403).json({ error: { code: "VERIFICATION_REQUIRED", message: "Verify with Stripe Connect to continue — visit /verify-stripe" } });
    return;
  }
  next();
}
