// Zod schemas for milestone lifecycle — submit / dispute / approve-release
import { z } from "zod";

const urlSchema = z.string().trim().url("Invalid URL").max(2000);

// Submission carries files and/or links plus an optional note — at least one required
export const submitMilestoneSchema = z
  .object({
    deliverables: z.array(urlSchema).max(5, "Max 5 deliverables").optional().default([]),
    note: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((v) => v.deliverables.length > 0 || !!v.note, "Attach a file/link or write a note");

export const disputeMilestoneSchema = z.object({
  reason: z.string().max(500).optional().or(z.literal("")),
});

export type SubmitMilestoneInput = z.infer<typeof submitMilestoneSchema>;
export type DisputeMilestoneInput = z.infer<typeof disputeMilestoneSchema>;
