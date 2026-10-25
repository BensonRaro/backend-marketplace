// Milestone lifecycle controllers — thin: parse → service → response
import type { Request, Response, NextFunction } from "express";
import { disputeMilestoneSchema, submitMilestoneSchema } from "../validators/milestone-lifecycle.validator.js";
import { submitMilestoneService, disputeMilestoneService, approveReleaseMilestoneService } from "../services/milestone-lifecycle.service.js";

function sessionUser(res: Response) {
  return res.locals.session.user as { id: string; role: string };
}

export async function submitMilestoneController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = submitMilestoneSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const u = sessionUser(res);
    res.json({ data: await submitMilestoneService(u.id, u.role, req.params.id as string, parsed.data) });
  } catch (err) {
    next(err);
  }
}

export async function disputeMilestoneController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = disputeMilestoneSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const u = sessionUser(res);
    res.json({ data: await disputeMilestoneService(u.id, u.role, req.params.id as string, parsed.data.reason || undefined) });
  } catch (err) {
    next(err);
  }
}

export async function approveMilestoneController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await approveReleaseMilestoneService(u.id, u.role, req.params.id as string) });
  } catch (err) {
    next(err);
  }
}
