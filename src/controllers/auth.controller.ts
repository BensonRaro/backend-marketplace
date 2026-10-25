// Auth controllers — thin: parse → call service → shape response
import type { Request, Response, NextFunction } from "express";
import {
  signupSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} from "../validators/auth.validator.js";
import {
  signupService,
  verifyEmailService,
  resendVerificationService,
} from "../services/auth.service.js";

export async function signupController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid input",
          },
        });
      return;
    }
    const user = await signupService(parsed.data);
    res
      .status(201)
      .json({ user, message: "Account created — check your email to verify" });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmailController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token =
      (req.query.token as string) ?? (req.body as { token?: string })?.token;
    const parsed = verifyEmailSchema.safeParse({ token });
    if (!parsed.success) {
      res
        .status(400)
        .json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid token",
          },
        });
      return;
    }
    const result = await verifyEmailService(parsed.data.token);
    res.json({
      message: result.alreadyVerified
        ? "Email already verified"
        : "Email verified — you can now sign in",
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function resendVerificationController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.issues[0]?.message ?? "Invalid email",
          },
        });
      return;
    }
    const result = await resendVerificationService(parsed.data.email);
    res.json({
      message: "Verification email resent — check your inbox",
      ...result,
    });
  } catch (err) {
    next(err);
  }
}
