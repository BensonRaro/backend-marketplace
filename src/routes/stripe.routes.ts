// Stripe verification routes — freelancer Connect vs client card setup (role-gated)
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/verification.js";
import {
  getStripeStatusController,
  createConnectOnboardingController,
  getClientPaymentStatusController,
  createClientSetupController,
  syncClientPaymentController,
} from "../controllers/stripe.controller.js";

const router = Router();
router.use(requireAuth);

// Freelancer — Connect payouts (receive escrow releases)
router.get("/status", requireRole("freelancer", "admin"), getStripeStatusController);
router.post("/connect", requireRole("freelancer", "admin"), createConnectOnboardingController);

// Client — saved card (fund escrow)
router.get("/client/status", requireRole("client", "admin"), getClientPaymentStatusController);
router.post("/client/setup", requireRole("client", "admin"), createClientSetupController);
router.post("/client/sync", requireRole("client", "admin"), syncClientPaymentController);

export default router;
