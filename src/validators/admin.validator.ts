// Zod schemas for admin queries — user list, activity log filters, own profile update
import { z } from "zod";

export const adminUsersQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["client", "freelancer", "admin"]).optional(),
  status: z.enum(["active", "banned"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Ban reason shown to the suspended user — must be explainable, not a one-liner
export const banUserSchema = z.object({
  reason: z.string().trim().min(5, "Give a short reason").max(500, "Reason is too long"),
});

export const adminActivityQuerySchema = z.object({
  action: z.string().trim().max(60).optional(),
  actorId: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
export type AdminActivityQuery = z.infer<typeof adminActivityQuerySchema>;
