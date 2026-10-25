// Admin moderation controllers — suspend / restore a user account
import type { Request, Response, NextFunction } from "express";
import { banUserSchema } from "../validators/admin.validator.js";
import { banUserService, unbanUserService } from "../services/admin-moderation.service.js";

export async function banUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = banUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const adminId = (res.locals.session.user as { id: string }).id;
    const userId = String(req.params.userId ?? "");
    res.json({ data: await banUserService(adminId, userId, parsed.data.reason) });
  } catch (err) {
    next(err);
  }
}

export async function unbanUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const adminId = (res.locals.session.user as { id: string }).id;
    const userId = String(req.params.userId ?? "");
    res.json({ data: await unbanUserService(adminId, userId) });
  } catch (err) {
    next(err);
  }
}
