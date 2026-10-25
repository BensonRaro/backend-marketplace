// Milestone controllers — thin: parse → service → response
import type { Request, Response, NextFunction } from "express";
import { milestoneInputSchema } from "../validators/milestone.validator.js";
import { listJobMilestonesService, createJobMilestoneService, createContractMilestoneService, deleteJobMilestoneService } from "../services/milestone.service.js";
import { createMilestoneFundService } from "../services/escrow.service.js";
import { createJobFundService } from "../services/job-fund.service.js";

function sessionUser(res: Response) {
  return res.locals.session.user as { id: string; role: string };
}

export async function listMilestonesController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await listJobMilestonesService(u.id, u.role, req.params.jobId as string) });
  } catch (err) {
    next(err);
  }
}

export async function createMilestoneController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = milestoneInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const u = sessionUser(res);
    res.status(201).json({ data: await createJobMilestoneService(u.id, u.role, req.params.jobId as string, parsed.data) });
  } catch (err) {
    next(err);
  }
}

export async function deleteMilestoneController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await deleteJobMilestoneService(u.id, u.role, req.params.id as string) });
  } catch (err) {
    next(err);
  }
}

export async function createContractMilestoneController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = milestoneInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const u = sessionUser(res);
    res.status(201).json({ data: await createContractMilestoneService(u.id, u.role, req.params.contractId as string, parsed.data) });
  } catch (err) {
    next(err);
  }
}

// Owner funds a whole fixed job — returns Stripe Checkout URL (redirect)
export async function fundJobController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await createJobFundService(u.id, req.params.id as string) });
  } catch (err) {
    next(err);
  }
}

// Owner funds a milestone — returns Stripe Checkout URL (redirect)
export async function fundMilestoneController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await createMilestoneFundService(u.id, req.params.id as string) });
  } catch (err) {
    next(err);
  }
}
