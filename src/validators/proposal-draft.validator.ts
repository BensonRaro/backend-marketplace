// Zod schemas for AI proposal drafting — the freelancer supplies the job, the model the words
import { z } from "zod";

// Request: which job to tailor the letter to (ownership/state checked in the service)
export const draftProposalSchema = z.object({
  jobId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid job"),
});

// Model reply: JSON-only prompt, so tolerate the snake_case variant some models emit
export const draftReplySchema = z
  .object({ coverLetter: z.string().optional(), cover_letter: z.string().optional() })
  .transform((v) => ({ coverLetter: (v.coverLetter ?? v.cover_letter ?? "").trim() }))
  // Short replies mean the model ignored the brief — treat them as a failed draft, not a blank box
  .pipe(z.object({ coverLetter: z.string().min(120, "Draft was too short to use").max(6000) }));

export type DraftProposalInput = z.infer<typeof draftProposalSchema>;
export type DraftReply = z.infer<typeof draftReplySchema>;
