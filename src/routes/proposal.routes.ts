// Proposal routes — freelancer submits/withdraws; owner reviews per job
import { Router } from "express";
import { requireAuth, requireOnboarding } from "../middlewares/auth.js";
import { requireFreelancerVerified, requireRole } from "../middlewares/verification.js";
import { createProposalController, listMyProposalsController, listClientProposalsController, listJobProposalsController, withdrawProposalController } from "../controllers/proposal.controller.js";
import { getProposalDraftController, queueProposalDraftController } from "../controllers/proposal-draft.controller.js";

const router = Router();

// Freelancer bids — payouts-verified per escrow gating (accept flow lands with contracts)
router.post("/proposals", requireAuth, requireOnboarding, requireFreelancerVerified, createProposalController);
// AI cover-letter draft — queued in Inngest, polled by GET (allowed before payout verification)
router.post("/proposals/draft", requireAuth, requireRole("freelancer", "admin"), queueProposalDraftController);
router.get("/proposals/draft", requireAuth, requireRole("freelancer", "admin"), getProposalDraftController);
router.get("/proposals/mine", requireAuth, requireRole("freelancer", "admin"), listMyProposalsController);
router.delete("/proposals/:id", requireAuth, withdrawProposalController);

// Client inbox — every bid across owned jobs (filtered by owner in service)
router.get("/proposals/client/mine", requireAuth, requireRole("client", "admin"), listClientProposalsController);

// Owner reviews bids on their job (ownership checked in service)
router.get("/job-postings/:jobId/proposals", requireAuth, listJobProposalsController);

export default router;
