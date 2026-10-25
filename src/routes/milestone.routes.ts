// Milestone + escrow routes — client owns job milestones; only owner funds
import { Router } from "express";
import { requireAuth, requireOnboarding } from "../middlewares/auth.js";
import { requireClientVerified, requireRole } from "../middlewares/verification.js";
import { listMilestonesController, createMilestoneController, createContractMilestoneController, deleteMilestoneController, fundMilestoneController } from "../controllers/milestone.controller.js";
import { submitMilestoneController, disputeMilestoneController, approveMilestoneController } from "../controllers/milestone-lifecycle.controller.js";

const router = Router();

// Job-scoped milestones (owner sees all; others see funded only)
router.get("/job-postings/:jobId/milestones", requireAuth, listMilestonesController);
router.post("/job-postings/:jobId/milestones", requireAuth, requireOnboarding, requireClientVerified, createMilestoneController);

// Single-milestone actions — owner only, funded escrow is immutable
router.delete("/milestones/:id", requireAuth, requireOnboarding, requireClientVerified, deleteMilestoneController);
router.post("/milestones/:id/fund", requireAuth, requireOnboarding, requireClientVerified, fundMilestoneController);

// Completion lifecycle — roles enforced in service (freelancer submits, client disputes/approves)
router.post("/milestones/:id/submit", requireAuth, requireOnboarding, submitMilestoneController);
router.post("/milestones/:id/dispute", requireAuth, requireOnboarding, disputeMilestoneController);
router.post("/milestones/:id/approve", requireAuth, requireOnboarding, approveMilestoneController);

// Contract-scoped milestones — client adds the next milestone mid-contract (ownership in service)
router.post("/contracts/:contractId/milestones", requireAuth, requireOnboarding, requireRole("client", "admin"), createContractMilestoneController);

export default router;
