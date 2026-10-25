// Zod schemas for job postings — client creates, freelancers read
import { z } from "zod";
import { milestoneInputSchema } from "./milestone.validator.js";

export const createJobSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(100),
  description: z.string().min(20, "Description must be at least 20 characters").max(5000),
  budgetType: z.enum(["fixed", "hourly"]),
  budget: z.number().min(5, "Min $5").max(100000, "Max $100,000"),
  skills: z.array(z.string().min(1).max(30)).min(1, "Add at least one skill").max(10),
  categoryId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid category").optional().or(z.literal("")),
  // Optional upfront milestones (amounts in dollars) — funded via escrow after posting
  milestones: z.array(milestoneInputSchema).max(10, "Max 10 milestones per job").optional(),
});

export const updateJobSchema = createJobSchema.partial().extend({
  isOpen: z.boolean().optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
export type UpdateJobInput = z.infer<typeof updateJobSchema>;
