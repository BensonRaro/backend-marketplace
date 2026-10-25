// Contract routes — owner accepts bids; both parties list their contracts
import { Router } from "express";
import { requireAuth, requireOnboarding } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/verification.js";
import { acceptProposalController, completeContractController, listMyContractsController } from "../controllers/contract.controller.js";

const router = Router();

// Owner accepts a pending bid — creates the contract (ownership checked in service)
router.post("/proposals/:id/accept", requireAuth, requireOnboarding, requireRole("client", "admin"), acceptProposalController);

// Client closes the books once milestones release — unlocks two-way reviews
router.post("/contracts/:id/complete", requireAuth, requireOnboarding, requireRole("client", "admin"), completeContractController);

// Role-aware inbox for client + freelancer dashboards
router.get("/contracts/mine", requireAuth, requireRole("client", "freelancer", "admin"), listMyContractsController);

export default router;
