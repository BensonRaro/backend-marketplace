// Zod schemas for chat — text and/or file attachments (at-least-one enforced in service)
import { z } from "zod";

export const sendMessageSchema = z.object({
  body: z.string().trim().max(2000, "Max 2000 characters").optional().default(""),
  attachments: z.array(z.string().url("Invalid file URL").max(2048)).max(5, "Max 5 files").optional().default([]),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
