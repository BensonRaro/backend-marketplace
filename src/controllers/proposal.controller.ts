// Proposal controllers — thin: parse → service → response
import type { Request, Response, NextFunction } from "express";
import { createProposalSchema } from "../validators/proposal.validator.js";
import { createProposalService, listMyProposalsService, listClientProposalsService, listJobProposalsService, withdrawProposalService } from "../services/proposal.service.js";

function sessionUser(res: Response) {
  return res.locals.session.user as { id: string; role: string };
}

export async function createProposalController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const u = sessionUser(res);
    res.status(201).json({ data: await createProposalService(u.id, u.role, parsed.data) });
  } catch (err) {
    next(err);
  }
}

export async function listMyProposalsController(_req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await listMyProposalsService(u.id) });
  } catch (err) {
    next(err);
  }
}

export async function listClientProposalsController(_req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await listClientProposalsService(u.id) });
  } catch (err) {
    next(err);
  }
}

export async function listJobProposalsController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await listJobProposalsService(u.id, u.role, req.params.jobId as string) });
  } catch (err) {
    next(err);
  }
}

export async function withdrawProposalController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await withdrawProposalService(u.id, u.role, req.params.id as string) });
  } catch (err) {
    next(err);
  }
}
