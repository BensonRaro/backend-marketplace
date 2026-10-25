// Contract controllers — thin: parse → service → response
import type { Request, Response, NextFunction } from "express";
import { acceptProposalService, completeContractService, listMyContractsService } from "../services/contract.service.js";

function sessionUser(res: Response) {
  return res.locals.session.user as { id: string; role: string };
}

export async function acceptProposalController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.status(201).json({ data: await acceptProposalService(u.id, u.role, req.params.id as string) });
  } catch (err) {
    next(err);
  }
}

export async function listMyContractsController(_req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await listMyContractsService(u.id, u.role) });
  } catch (err) {
    next(err);
  }
}

export async function completeContractController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await completeContractService(u.id, u.role, req.params.id as string) });
  } catch (err) {
    next(err);
  }
}
