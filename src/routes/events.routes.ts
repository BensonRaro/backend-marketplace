// SSE stream — authenticated per-user live events (heartbeats keep proxies alive)
import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { subscribe } from "../lib/events.js";

const router = Router();

router.get("/stream", requireAuth, (req, res) => {
  const userId = (res.locals.session.user as { id: string }).id;
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`: ready\n\n`);
  const unsubscribe = subscribe(userId, (payload) => {
    res.write(`id: ${payload.id}\nevent: ${payload.type}\ndata: ${JSON.stringify(payload.data)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(`: ping\n\n`), 25000);
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

export default router;
