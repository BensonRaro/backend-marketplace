// Auth service — signup + email verification (Resend) + resend + verify
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { sendVerificationEmail } from "../lib/email.js";
import type { SignupInput } from "../validators/auth.validator.js";

function apiError(message: string, status: number, code: string): Error & { status?: number; code?: string } {
  const e = new Error(message) as Error & { status?: number; code?: string };
  e.status = status;
  e.code = code;
  return e;
}

export async function signupService(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw apiError("Email already registered", 409, "CONFLICT");

  const hashed = await bcrypt.hash(input.password, 10);
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, password: hashed, role: input.role },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  // Create verification token (24h) — only for credentials users
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.verificationToken.create({ data: { identifier: input.email, token, expires } });

  // Send email — don't block signup if it fails (user can resend)
  try {
    await sendVerificationEmail(input.email, input.name, token);
  } catch (err) {
    console.error("[signup] verification email failed:", err);
  }
  return user;
}

export async function verifyEmailService(token: string) {
  const vt = await prisma.verificationToken.findUnique({ where: { token } });
  if (!vt) throw apiError("Invalid or expired verification link", 400, "INVALID_TOKEN");
  if (vt.expires < new Date()) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    throw apiError("Verification link expired — please request a new one", 400, "TOKEN_EXPIRED");
  }
  const user = await prisma.user.findUnique({ where: { email: vt.identifier } });
  if (!user) throw apiError("User not found", 404, "NOT_FOUND");
  if (user.emailVerified) {
    await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
    return { alreadyVerified: true, email: vt.identifier };
  }
  await prisma.user.update({ where: { email: vt.identifier }, data: { emailVerified: new Date() } });
  await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
  // cleanup other tokens for same email
  await prisma.verificationToken.deleteMany({ where: { identifier: vt.identifier } }).catch(() => {});
  return { alreadyVerified: false, email: vt.identifier };
}

export async function resendVerificationService(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw apiError("No account found for this email", 404, "NOT_FOUND");
  if (user.emailVerified) throw apiError("Email already verified — please sign in", 400, "ALREADY_VERIFIED");
  if (!user.password) throw apiError("This account uses Google sign-in — no verification needed", 400, "OAUTH_ACCOUNT");

  // throttle: delete old tokens older than 1 min handled by rate-limit at controller; here just rotate
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  const token = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.verificationToken.create({ data: { identifier: email, token, expires } });
  await sendVerificationEmail(email, user.name ?? email, token);
  return { email };
}
