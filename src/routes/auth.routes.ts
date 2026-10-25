// Auth routes — public signup + email verification (Resend for credentials only)
import { Router } from "express";
import { signupController, verifyEmailController, resendVerificationController } from "../controllers/auth.controller.js";

const router = Router();

// POST /api/auth/signup — create account + send verification email
router.post("/signup", signupController);

// GET & POST /api/auth/verify-email?token= — verify credentials email
router.get("/verify-email", verifyEmailController);
router.post("/verify-email", verifyEmailController);

// POST /api/auth/resend-verification — resend link for unverified credentials users
router.post("/resend-verification", resendVerificationController);

export default router;
