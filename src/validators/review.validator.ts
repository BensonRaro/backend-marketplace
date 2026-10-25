// Zod schemas for reviews — post-completion 1-5 star ratings with optional comment
import { z } from "zod";

export const createReviewSchema = z.object({
  rating: z.number().int().min(1, "Min 1 star").max(5, "Max 5 stars"),
  comment: z.string().trim().max(500, "Max 500 characters").optional().default(""),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
