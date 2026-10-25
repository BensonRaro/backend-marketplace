// Zod schemas for the current user's own account (name + avatar)
import { z } from "zod";

export const updateMyProfileSchema = z.object({
  name: z.string().trim().max(80).optional(),
  image: z.string().trim().max(500).optional(),
});

export type UpdateMyProfileInput = z.infer<typeof updateMyProfileSchema>;
