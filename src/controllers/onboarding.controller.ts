// Onboarding controllers — thin: parse → service → response
import type { Request, Response, NextFunction } from "express";
import { clientOnboardingSchema, freelancerOnboardingSchema } from "../validators/onboarding.validator.js";
import { getOnboardingStatusService, completeClientOnboardingService, completeFreelancerOnboardingService } from "../services/onboarding.service.js";

export async function getOnboardingStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (res.locals.session.user as { id: string }).id;
    const data = await getOnboardingStatusService(userId);
    res.json({ data });
  } catch (err) {
    next(err);
  }
}

export async function completeClientOnboardingController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = clientOnboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      console.warn("[onboarding:client] validation", req.body, msg);
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: msg } });
      return;
    }
    const userId = (res.locals.session.user as { id: string }).id;
    const result = await completeClientOnboardingService(userId, parsed.data);
    res.json({ message: "Onboarding completed", ...result });
  } catch (err) {
    next(err);
  }
}

export async function completeFreelancerOnboardingController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = freelancerOnboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      console.warn("[onboarding:freelancer] validation", req.body, msg);
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: msg } });
      return;
    }
    const userId = (res.locals.session.user as { id: string }).id;
    const result = await completeFreelancerOnboardingService(userId, parsed.data);
    res.json({ message: "Onboarding completed", ...result });
  } catch (err) {
    next(err);
  }
}
