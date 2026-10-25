// Admin routes — platform-wide read access + moderation (admin role only)
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/verification.js";
import { adminStatsController, listUsersController, listActivityLogsController } from "../controllers/admin.controller.js";
import { banUserController, unbanUserController } from "../controllers/admin-moderation.controller.js";

const router = Router();

router.get("/admin/stats", requireAuth, requireRole("admin"), adminStatsController);
router.get("/admin/users", requireAuth, requireRole("admin"), listUsersController);
router.get("/admin/activity-logs", requireAuth, requireRole("admin"), listActivityLogsController);

// Moderation — suspend / restore an account (reason is required and shown to the user)
router.patch("/admin/users/:userId/ban", requireAuth, requireRole("admin"), banUserController);
router.patch("/admin/users/:userId/unban", requireAuth, requireRole("admin"), unbanUserController);

export default router;
