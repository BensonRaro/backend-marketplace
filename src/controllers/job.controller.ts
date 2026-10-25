// Job controllers — thin: parse → service → response
import type { Request, Response, NextFunction } from "express";
import { createJobSchema, updateJobSchema } from "../validators/job.validator.js";
import { createJobService, listJobsService, listClientJobsService, getJobService, updateJobService, deleteJobService } from "../services/job.service.js";

export async function createJobController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = createJobSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: msg } });
      return;
    }
    const user = res.locals.session.user as { id: string; role: string };
    const job = await createJobService(user.id, user.role, parsed.data);
    res.status(201).json({ data: job });
  } catch (err) {
    next(err);
  }
}

export async function listJobsController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await listJobsService({
      category: req.query.category as string | undefined,
      skill: req.query.skill as string | undefined,
      search: req.query.search as string | undefined,
      budgetType: req.query.budgetType as string | undefined,
      minBudget: req.query.minBudget ? Number(req.query.minBudget) : undefined,
      maxBudget: req.query.maxBudget ? Number(req.query.maxBudget) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listClientJobsController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = res.locals.session.user as { id: string };
    const result = await listClientJobsService(user.id, {
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      skill: req.query.skill as string | undefined,
      budgetType: req.query.budgetType as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getJobController(req: Request, res: Response, next: NextFunction) {
  try {
    // Public route — session optional; owner/admin gets proposals + all milestones
    const requester = res.locals.session?.user as { id: string; role: string } | undefined;
    const job = await getJobService(req.params.id as string, requester);
    res.json({ data: job });
  } catch (err) {
    next(err);
  }
}

export async function updateJobController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = updateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: msg } });
      return;
    }
    const user = res.locals.session.user as { id: string; role: string };
    const job = await updateJobService(user.id, user.role, req.params.id as string, parsed.data);
    res.json({ data: job });
  } catch (err) {
    next(err);
  }
}

export async function deleteJobController(req: Request, res: Response, next: NextFunction) {
  try {
    const user = res.locals.session.user as { id: string; role: string };
    const result = await deleteJobService(user.id, user.role, req.params.id as string);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
