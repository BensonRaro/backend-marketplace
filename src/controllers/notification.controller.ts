// Notification controllers — thin: parse → service → response (own inbox only)
import type { Request, Response, NextFunction } from "express";
import { listNotificationsService, unreadCountService, markReadService, markAllReadService } from "../services/notification.service.js";

function sessionUser(res: Response) {
  return res.locals.session.user as { id: string };
}

export async function listNotificationsController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({
      data: await listNotificationsService(u.id, {
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        unreadOnly: req.query.unreadOnly === "true",
      }),
    });
  } catch (err) {
    next(err);
  }
}

export async function unreadCountController(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: { count: await unreadCountService(sessionUser(res).id) } });
  } catch (err) {
    next(err);
  }
}

export async function markReadController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ data: await markReadService(sessionUser(res).id, req.params.id as string) });
  } catch (err) {
    next(err);
  }
}

export async function markAllReadController(_req: Request, res: Response, next: NextFunction) {
  try {
    const r = await markAllReadService(sessionUser(res).id);
    res.json({ data: { count: r.count } });
  } catch (err) {
    next(err);
  }
}
