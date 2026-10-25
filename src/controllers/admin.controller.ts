// Admin controllers — thin: query → service → response
import type { Request, Response, NextFunction } from "express";
import { getAdminStatsService } from "../services/admin.service.js";
import { listUsersService } from "../services/admin-users.service.js";
import { listActivityLogsService } from "../services/admin-activity.service.js";
import { adminUsersQuerySchema, adminActivityQuerySchema } from "../validators/admin.validator.js";

export async function adminStatsController(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await getAdminStatsService() });
  } catch (err) {
    next(err);
  }
}

export async function listUsersController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = adminUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    res.json(await listUsersService(parsed.data));
  } catch (err) {
    next(err);
  }
}

export async function listActivityLogsController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = adminActivityQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    res.json(await listActivityLogsService(parsed.data));
  } catch (err) {
    next(err);
  }
}
