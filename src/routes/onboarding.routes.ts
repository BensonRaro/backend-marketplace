// Onboarding routes — all require auth (admin bypassed via service)
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { getOnboardingStatusController, completeClientOnboardingController, completeFreelancerOnboardingController } from "../controllers/onboarding.controller.js";

const router = Router();

// All onboarding routes require auth
router.use(requireAuth);

router.get("/status", getOnboardingStatusController);
router.post("/client", completeClientOnboardingController);
router.post("/freelancer", completeFreelancerOnboardingController);

export default router;
