// Ban guard — suspended accounts keep read access but every write returns 403
import type { NextFunction, Request, Response } from "express";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function blockBannedWrites(req: Request, res: Response, next: NextFunction) {
  if (READ_METHODS.has(req.method.toUpperCase())) {
    next();
    return;
  }
  const user = (res.locals.session as { user?: { isBanned?: boolean; banReason?: string | null } } | undefined)?.user;
  if (!user?.isBanned) {
    next();
    return;
  }
  res.status(403).json({
    error: {
      code: "ACCOUNT_BANNED",
      message: user.banReason
        ? `Your account is suspended: ${user.banReason}`
        : "Your account is suspended. Contact support for details.",
    },
  });
}
