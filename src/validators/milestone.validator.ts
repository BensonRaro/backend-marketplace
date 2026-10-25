// Zod schemas for job milestones — client defines + funds upfront via escrow
import { z } from "zod";

// Single milestone draft — amount in dollars (service converts to cents)
export const milestoneInputSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  description: z.string().max(1000).optional().or(z.literal("")),
  amount: z.number().min(5, "Min $5").max(100000, "Max $100,000"),
});

// Nested on job creation (optional) + standalone add — max 10 per job
export const milestoneListSchema = z.array(milestoneInputSchema).max(10, "Max 10 milestones per job");

export type MilestoneInput = z.infer<typeof milestoneInputSchema>;
