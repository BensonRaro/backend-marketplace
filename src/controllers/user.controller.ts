// User controllers — thin: params/session → service → response
import type { Request, Response, NextFunction } from "express";
import { getPublicProfileService, updateMyProfileService } from "../services/user.service.js";
import { getClientReviewStatusService, createClientReviewService } from "../services/client-review.service.js";
import { createReviewSchema } from "../validators/review.validator.js";
import { updateMyProfileSchema } from "../validators/user.validator.js";

export async function getUserProfileController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await getPublicProfileService(req.params.userId as string) });
  } catch (err) {
    next(err);
  }
}

// Current user updates their own name/avatar (role + verification are server-controlled)
export async function updateMyProfileController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateMyProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const viewerId = (res.locals.session.user as { id: string }).id;
    res.json({ data: await updateMyProfileService(viewerId, parsed.data) });
  } catch (err) {
    next(err);
  }
}

// Freelancer asks whether they can still review this client (client details sheet)
export async function getClientReviewStatusController(req: Request, res: Response, next: NextFunction) {
  try {
    const viewerId = (res.locals.session.user as { id: string }).id;
    res.json({ data: await getClientReviewStatusService(viewerId, req.params.userId as string) });
  } catch (err) {
    next(err);
  }
}

// Freelancer posts a rating + comment about a client
export async function createClientReviewController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const viewerId = (res.locals.session.user as { id: string }).id;
    res.status(201).json({ data: await createClientReviewService(viewerId, req.params.userId as string, parsed.data) });
  } catch (err) {
    next(err);
  }
}
