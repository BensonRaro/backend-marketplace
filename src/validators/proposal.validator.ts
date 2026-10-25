// Zod schemas for proposals — freelancer bids on open jobs (amounts in dollars)
import { z } from "zod";

export const createProposalSchema = z.object({
  jobId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid job"),
  coverLetter: z.string().min(20, "Cover letter must be at least 20 characters").max(2000),
  bidAmount: z.number().min(5, "Min $5").max(100000, "Max $100,000"),
  duration: z.number().int().min(1, "Min 1 day").max(365, "Max 365 days").optional(),
});

export type CreateProposalInput = z.infer<typeof createProposalSchema>;
