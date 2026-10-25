// Stripe controllers — thin (freelancer Connect + client card setup)
import type { Request, Response, NextFunction } from "express";
import { createConnectOnboardingService, getStripeStatusService } from "../services/stripe.service.js";
import { createClientSetupService, getClientPaymentStatusService, syncClientPaymentService } from "../services/stripe-client.service.js";

export async function getStripeStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (res.locals.session.user as { id: string }).id;
    const data = await getStripeStatusService(userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function createConnectOnboardingController(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (res.locals.session.user as { id: string }).id;
    const result = await createConnectOnboardingService(userId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// Client card verification — status of saved payment method
export async function getClientPaymentStatusController(_req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (res.locals.session.user as { id: string }).id;
    const data = await getClientPaymentStatusService(userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

// Client card verification — create Setup Checkout session (redirect URL)
export async function createClientSetupController(_req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (res.locals.session.user as { id: string }).id;
    const result = await createClientSetupService(userId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// Client card verification — manual re-sync after returning from Checkout
export async function syncClientPaymentController(_req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (res.locals.session.user as { id: string }).id;
    const result = await syncClientPaymentService(userId);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
