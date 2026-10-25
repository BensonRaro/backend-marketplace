// Message controllers — thin: parse → service → response
import type { Request, Response, NextFunction } from "express";
import { sendMessageSchema } from "../validators/message.validator.js";
import { listMessagesService, sendMessageService } from "../services/message.service.js";

function sessionUser(res: Response) {
  return res.locals.session.user as { id: string; role: string };
}

export async function listMessagesController(req: Request, res: Response, next: NextFunction) {
  try {
    const u = sessionUser(res);
    res.json({ data: await listMessagesService(u.id, u.role, req.params.contractId as string) });
  } catch (err) {
    next(err);
  }
}

export async function sendMessageController(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } });
      return;
    }
    const u = sessionUser(res);
    res.status(201).json({ data: await sendMessageService(u.id, u.role, req.params.contractId as string, parsed.data) });
  } catch (err) {
    next(err);
  }
}
