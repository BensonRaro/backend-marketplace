// Job posting routes — REST /job-postings (kebab, plural)
import { Router } from "express";
import { requireAuth, requireOnboarding } from "../middlewares/auth.js";
import { requireClientVerified, requireRole } from "../middlewares/verification.js";
import { createJobController, listJobsController, listClientJobsController, getJobController, updateJobController, deleteJobController } from "../controllers/job.controller.js";
import { getRecommendationsController, requestRecommendationsController } from "../controllers/recommendation.controller.js";
import { fundJobController } from "../controllers/milestone.controller.js";

const router = Router();

// Protected: client own jobs must be before :id
router.get("/client/mine", requireAuth, requireOnboarding, listClientJobsController);

// AI proposal shortlist — owner only (ownership checked in the service, model runs in Inngest)
router.get("/:id/recommendations", requireAuth, requireRole("client", "admin"), getRecommendationsController);
router.post("/:id/recommendations", requireAuth, requireOnboarding, requireRole("client", "admin"), requestRecommendationsController);

// Public: browse jobs
router.get("/", listJobsController);
router.get("/:id", getJobController);

// Protected: verified client creates + edits + deletes (card on file to fund work)
router.post("/", requireAuth, requireOnboarding, requireClientVerified, createJobController);
router.post("/:id/fund", requireAuth, requireOnboarding, requireClientVerified, fundJobController);
router.patch("/:id", requireAuth, requireOnboarding, requireClientVerified, updateJobController);
router.delete("/:id", requireAuth, requireOnboarding, requireClientVerified, deleteJobController);

export default router;
