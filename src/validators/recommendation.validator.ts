// Zod schemas for AI proposal recommendations — job id params + the model's reply shape
import { z } from "zod";

// Job id path param (Mongo ObjectId)
export const jobIdParamSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, "Invalid job"),
});

// What the model must return — lenient types (free models drift on numbers/strings),
// normalized and clamped in the service before anything is stored
export const recommendationResponseSchema = z.object({
  ranked: z
    .array(
      z.object({
        proposalId: z.string().min(1),
        score: z.coerce.number(),
        summary: z.string().default(""),
        strengths: z.array(z.string()).default([]),
        concerns: z.array(z.string()).default([]),
      }),
    )
    .min(1, "Model returned no ranked proposals"),
});

export type RecommendationResponse = z.infer<typeof recommendationResponseSchema>;
