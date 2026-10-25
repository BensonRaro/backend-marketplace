// Review controllers — thin: parse → service → response
import type { Request, Response, NextFunction } from "express";
import { createReviewSchema } from "../validators/review.validator.js";
import { createReviewService, listContractReviewsService, ratingSummaryService, listUserReviewsService } from "../services/review.service.js";
import { updateReviewService, deleteReviewService } from "../services/review-manage.service.js";

function sessionUser(res: Response) {
  return res.locals.session.user as { id: string; role: string };
}

export async function createReviewController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const u = sessionUser(res);
    res.status(201).json({ data: await createReviewService(u.id, req.params.contractId as string, parsed.data) });
  } catch (err) {
    next(err);
  }
}

export async function listContractReviewsController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await listContractReviewsService(u.id, u.role, req.params.contractId as string) });
  } catch (err) {
    next(err);
  }
}

export async function ratingSummaryController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await ratingSummaryService(req.params.userId as string) });
  } catch (err) {
    next(err);
  }
}

export async function listUserReviewsController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await listUserReviewsService(req.params.userId as string, req.query.limit ? Number(req.query.limit) : undefined) });
  } catch (err) {
    next(err);
  }
}

export async function updateReviewController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const u = sessionUser(res);
    res.json({ data: await updateReviewService(u.id, req.params.reviewId as string, parsed.data) });
  } catch (err) {
    next(err);
  }
}

export async function deleteReviewController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await deleteReviewService(u.id, req.params.reviewId as string) });
  } catch (err) {
    next(err);
  }
}
