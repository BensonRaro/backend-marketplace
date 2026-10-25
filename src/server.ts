// Express server entry — production-ready middleware for the freelance marketplace
import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import dotenv from "dotenv";
import { ExpressAuth } from "@auth/express";
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js";
import { authConfig } from "./lib/auth.js";
import { attachSession, requireAuth } from "./middlewares/auth.js";
import { blockBannedWrites } from "./middlewares/ban.js";
import authRoutes from "./routes/auth.routes.js";
import onboardingRoutes from "./routes/onboarding.routes.js";
import jobRoutes from "./routes/job.routes.js";
import categoryRoutes from "./routes/category.routes.js";
import stripeRoutes from "./routes/stripe.routes.js";
import milestoneRoutes from "./routes/milestone.routes.js";
import proposalRoutes from "./routes/proposal.routes.js";
import contractRoutes from "./routes/contract.routes.js";
import messageRoutes from "./routes/message.routes.js";
import reviewRoutes from "./routes/review.routes.js";
import userRoutes from "./routes/user.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import eventsRoutes from "./routes/events.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";
import { createRouteHandler } from "uploadthing/express";
import { uploadRouter } from "./lib/uploadthing.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Trust proxy — required for Auth.js to detect HTTPS via X-Forwarded-* (Vercel/proxy)
app.set("trust proxy", true);

// Request logging — dev logs method/url/status/time
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// Security headers
app.use(helmet());

// CORS — allow frontend with credentials (cookies/auth + UploadThing headers)
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    // allowedHeaders: [
    //   "Content-Type",
    //   "Authorization",
    //   "x-uploadthing-package",
    //   "x-uploadthing-version",
    //   "x-uploadthing-be-adapter",
    //   "x-ut-identifier",
    //   "stripe-signature",
    // ],
  }),
);

// Stripe webhook — must be BEFORE json parser (raw body for signature)
// ngrok forwards https://unwavered-nash-geotactically.ngrok-free.dev/api/webhook/stripe -> localhost:5000
app.use(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  webhookRoutes,
);

// UploadThing — must be BEFORE body parsers (it needs raw body for multipart/presign)
app.use("/api/uploadthing", createRouteHandler({ router: uploadRouter }));

// Cookies + body parsers — Auth.js needs these before its handler
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public auth routes — signup before session attach (no auth required)
app.use("/api/auth", authRoutes);

// Auth.js — primary mount at /api/auth per Google callback http://localhost:5000/api/auth/callback/google
app.use("/api/auth", ExpressAuth(authConfig));
// Legacy /auth kept for credentials (can be removed once frontend migrates to /api/auth)
app.use("/auth", ExpressAuth(authConfig));

// Inngest — durable background jobs (calls Inngest → our functions; no session needed)
app.use("/api/inngest", serve({ client: inngest, functions }));

// Attach session to res.locals for all subsequent routes (optional helper)
app.use(attachSession);

// Suspended accounts: reads stay available, every write is refused (auth routes stay open so they can sign out)
app.use("/api", blockBannedWrites);

// Onboarding — must be after attachSession so requireAuth can use it
app.use("/api/onboarding", onboardingRoutes);

// Job postings + milestones/escrow + proposals + categories + Stripe verification
app.use("/api/job-postings", jobRoutes);
app.use("/api", milestoneRoutes);
app.use("/api", proposalRoutes);
app.use("/api", contractRoutes);
app.use("/api", messageRoutes);
app.use("/api", reviewRoutes);
app.use("/api", userRoutes);
app.use("/api", adminRoutes);
app.use("/api", notificationRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/stripe", stripeRoutes);

// Health checks — public, no auth required
app.get("/", (_req, res) => {
  res.json({ message: "Freelance Marketplace API is running", status: "ok" });
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Example protected route — verifies Auth.js wiring (remove/replace with real resources)
app.get("/api/me", requireAuth, (_req, res) => {
  res.json({ user: res.locals.session.user });
});

// 404 handler — consistent error shape per AGENTS.md
app.use((_req, res) => {
  res
    .status(404)
    .json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

// Global error handler — keeps { error:{code,message} } shape
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const e = err as { status?: number; code?: string; message?: string };
    const status = e.status ?? 500;
    const code = e.code ?? "INTERNAL_ERROR";
    res
      .status(status)
      .json({ error: { code, message: e.message ?? "Internal error" } });
  },
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
