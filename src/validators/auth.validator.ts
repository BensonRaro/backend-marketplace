// Zod schemas for auth — validates signup + verification payloads
import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  role: z.enum(["client", "freelancer"]).default("client"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(10, "Invalid token"),
});

export const resendVerificationSchema = z.object({
  email: z.string().email("Invalid email"),
});

export type SignupInput = z.infer<typeof signupSchema>;
