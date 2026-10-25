// User routes — public profile lookup + freelancer→client reviews (client details sheet)
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/verification.js";
import { getUserProfileController, getClientReviewStatusController, createClientReviewController, updateMyProfileController } from "../controllers/user.controller.js";

const router = Router();

router.get("/users/:userId/profile", getUserProfileController);
router.patch("/users/me", requireAuth, updateMyProfileController);

// Freelancers review clients only after a completed contract (resolved in service)
router.get("/users/:userId/review-status", requireAuth, requireRole("freelancer"), getClientReviewStatusController);
router.post("/users/:userId/reviews", requireAuth, requireRole("freelancer"), createClientReviewController);

export default router;
