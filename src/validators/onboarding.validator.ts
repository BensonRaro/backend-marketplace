// Zod schemas for onboarding — client & freelancer (light-only, <100 lines)
import { z } from "zod";

// Allow empty string or valid URL (with or without protocol — we normalize)
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .refine((v) => !v || /^https?:\/\/.+/.test(v) || /^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v), "Invalid URL — use https://example.com")
  .transform((v) => (!v ? "" : v.startsWith("http") ? v : `https://${v}`));

const imageSchema = z.string().trim().optional().or(z.literal("")).refine((v) => !v || /^https?:\/\/.+/.test(v), "Invalid image URL");
const websiteSchema = optionalUrl;

export const clientOnboardingSchema = z.object({
  name: z.string().min(2, "Name is required").max(60),
  image: imageSchema,
  company: z.string().max(80).optional().or(z.literal("")),
  bio: z.string().min(10, "Tell us a bit about yourself (min 10 chars)").max(500),
  location: z.string().max(100).optional().or(z.literal("")),
  website: websiteSchema,
});

export const freelancerOnboardingSchema = z.object({
  name: z.string().min(2, "Name is required").max(60),
  image: imageSchema,
  title: z.string().min(2, "Professional title is required").max(80),
  bio: z.string().min(20, "Bio must be at least 20 characters").max(800),
  skills: z.array(z.string().min(1).max(30)).min(1, "Add at least one skill").max(10),
  hourlyRate: z.number().min(5, "Min $5/hr").max(500, "Max $500/hr"),
  location: z.string().max(100).optional().or(z.literal("")),
  website: websiteSchema,
  portfolio: websiteSchema,
});

export type ClientOnboardingInput = z.infer<typeof clientOnboardingSchema>;
export type FreelancerOnboardingInput = z.infer<typeof freelancerOnboardingSchema>;
