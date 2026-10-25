// Stripe validators — client setup takes no body (Checkout creates the session)
import { z } from "zod";

export const clientSetupSchema = z.object({}).strict();
export type ClientSetupInput = z.infer<typeof clientSetupSchema>;
