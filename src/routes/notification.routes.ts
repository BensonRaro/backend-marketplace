// Notification routes — own inbox only (any authenticated role hits their own)
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { listNotificationsController, unreadCountController, markReadController, markAllReadController } from "../controllers/notification.controller.js";

const router = Router();

router.get("/notifications", requireAuth, listNotificationsController);
router.get("/notifications/unread-count", requireAuth, unreadCountController);
router.patch("/notifications/:id/read", requireAuth, markReadController);
router.post("/notifications/read-all", requireAuth, markAllReadController);

export default router;
