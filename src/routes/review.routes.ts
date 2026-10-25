// Review routes — write for contract parties, public read for hiring decisions
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/verification.js";
import { createReviewController, listContractReviewsController, ratingSummaryController, listUserReviewsController, updateReviewController, deleteReviewController } from "../controllers/review.controller.js";

const router = Router();

// Parties rate each other after completion (completion + membership checked in service)
router.post("/contracts/:contractId/reviews", requireAuth, requireRole("client", "freelancer"), createReviewController);
router.get("/contracts/:contractId/reviews", requireAuth, requireRole("client", "freelancer", "admin"), listContractReviewsController);

// Authors edit/delete their own reviews (ownership checked in service)
router.patch("/reviews/:reviewId", requireAuth, requireRole("client", "freelancer"), updateReviewController);
router.delete("/reviews/:reviewId", requireAuth, requireRole("client", "freelancer"), deleteReviewController);

// Public — clients read freelancer ratings before hiring; job cards read client ratings
router.get("/users/:userId/rating", ratingSummaryController);
router.get("/users/:userId/reviews", listUserReviewsController);

export default router;
