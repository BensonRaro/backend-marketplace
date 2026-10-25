// Message routes — contract thread chat for the two parties (membership checked in service)
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/verification.js";
import { listMessagesController, sendMessageController } from "../controllers/message.controller.js";

const router = Router();

router.get("/contracts/:contractId/messages", requireAuth, requireRole("client", "freelancer", "admin"), listMessagesController);
router.post("/contracts/:contractId/messages", requireAuth, requireRole("client", "freelancer", "admin"), sendMessageController);

export default router;
