/**
 * app.js — Express app factory (separate from index.js so tests can import it
 * without binding a port).
 */
import express from "express";
import cors from "cors";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { groupsRouter } from "./routes/groups.js";
import { sessionsRouter } from "./routes/sessions.js";
import { signupsRouter } from "./routes/signups.js";
import { membersRouter } from "./routes/members.js";

// ALLOWED_ORIGINS is a comma-separated list so we can allow multiple origins
// (e.g. GitHub Pages + localhost) without duplicating environment entries.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());

const app = express();

// Render (and most cloud proxies) sit behind a load balancer.
// trust proxy lets express-rate-limit read the real client IP from X-Forwarded-For
// instead of the proxy's internal IP — otherwise every request looks like it
// comes from the same address and rate-limiting breaks.
app.set("trust proxy", 1);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!origin) return cb(null, true);
    // In dev, accept any localhost/127.0.0.1 origin regardless of port
    // (Vite increments the port when earlier ones are still in use)
    if (process.env.NODE_ENV !== "production") {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
    }
    if (allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

app.use(express.json());

// Health check — no auth, used by Render and the keep-warm workflow
app.get("/health", (_req, res) => res.json({ ok: true }));

// Auth routes (rate-limited inside the router, no JWT required)
app.use("/auth", authRouter);

// All other routes require a valid JWT
app.use(requireAuth);

// /users/me/groups — mounted on groupsRouter as GET /me/groups
app.use("/users", groupsRouter);

// Group CRUD
app.use("/groups", groupsRouter);

// Sessions nested under groups
app.use("/groups/:groupId/sessions", sessionsRouter);

// Signups — mounted at session level; handles /signup and /signups
app.use("/groups/:groupId/sessions/:sessionId", signupsRouter);

// Members — /leave is registered before /:userId inside the router
app.use("/groups/:groupId/members", membersRouter);

export default app;
