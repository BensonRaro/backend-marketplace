// Recommendation controllers — thin: parse → service → response
import type { Request, Response, NextFunction } from "express";
import { jobIdParamSchema } from "../validators/recommendation.validator.js";
import { getRecommendationsService, requestRecommendationsService } from "../services/recommendation.service.js";

// Validated job id from the path, or null after answering 400
function jobIdFrom(req: Request, res: Response) {
  const parsed = jobIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid job id" } });
    return null;
  }
  return parsed.data.id;
}

function sessionUser(res: Response) {
  return res.locals.session.user as { id: string; role: string };
}

// Owner reads the stored shortlist (polled by the UI while a run is in flight)
export async function getRecommendationsController(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = jobIdFrom(req, res);
    if (!jobId) return;
    const u = sessionUser(res);
    res.json({ data: await getRecommendationsService(u.id, u.role, jobId) });
  } catch (err) {
    next(err);
  }
}

// Owner queues a refresh — 202, the model call happens in Inngest
export async function requestRecommendationsController(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = jobIdFrom(req, res);
    if (!jobId) return;
    const u = sessionUser(res);
    res.status(202).json({ data: await requestRecommendationsService(u.id, u.role, jobId) });
  } catch (err) {
    next(err);
  }
}
