// Proposal draft controller — thin: parse → service → response (the model runs in Inngest)
import type { Request, Response, NextFunction } from "express";
import { draftProposalSchema } from "../validators/proposal-draft.validator.js";
import { getDraftService, queueDraftService } from "../services/proposal-draft.service.js";

const JOB_ID = /^[a-f\d]{24}$/i;

function sessionUser(res: Response) {
  return res.locals.session.user as { id: string; role: string };
}

function badRequest(res: Response, message: string) {
  res.status(400).json({ error: { code: "VALIDATION_ERROR", message } });
}

// Queue a draft — 202 immediately; the model call happens in the background job
export async function queueProposalDraftController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = draftProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      badRequest(res, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
      return;
    }
    const u = sessionUser(res);
    res.status(202).json({ data: await queueDraftService(u.id, u.role, parsed.data.jobId) });
  } catch (err) {
    next(err);
  }
}

// Poll for the result — status is queued | ready | failed | none
export async function getProposalDraftController(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = req.query.jobId;
    if (typeof jobId !== "string" || !JOB_ID.test(jobId)) {
      badRequest(res, "jobId: Invalid job");
      return;
    }
    const u = sessionUser(res);
    res.json({ data: await getDraftService(u.id, jobId) });
  } catch (err) {
    next(err);
  }
}
