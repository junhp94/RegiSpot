/**
 * Auth routes — POST /auth/register, POST /auth/login, GET /auth/me
 * Replaces Cognito: we store hashed passwords ourselves and issue JWTs.
 * Rate-limited because these endpoints accept credentials from the internet.
 */
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import pool from "../lib/db.js";
import { sanitizeString } from "../lib/validators.js";
import { canCreateGroups } from "../lib/permissions.js";

// Public user shape returned by register/login/me
function publicUser(id, email, name) {
  return { userId: id, email, name, canCreateGroups: canCreateGroups(email) };
}

export const authRouter = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  // The integration suite registers dozens of users from one IP.
  skip: () => process.env.NODE_ENV === "test",
});

authRouter.use(limiter);

function makeToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// POST /auth/register
authRouter.post("/register", async (req, res) => {
  const { email, password, name } = req.body || {};
  const cleanEmail = sanitizeString(email, 254).toLowerCase();
  const cleanName = sanitizeString(name, 50);

  if (!cleanEmail || !cleanEmail.includes("@")) {
    return res.status(400).json({ error: "A valid email is required" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!cleanName || cleanName.length < 1) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, name`,
      [cleanEmail, cleanName, hash]
    );
    const user = result.rows[0];
    const token = makeToken(user);
    res.status(201).json({ token, user: publicUser(user.id, user.email, user.name) });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "An account with that email already exists" });
    }
    console.error("register error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /auth/login
authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = sanitizeString(email, 254).toLowerCase();

  if (!cleanEmail || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const result = await pool.query(
      "SELECT id, email, name, password_hash FROM users WHERE lower(email) = $1",
      [cleanEmail]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = makeToken(user);
    res.json({ token, user: publicUser(user.id, user.email, user.name) });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /auth/me — verify token and return current user (used by AuthContext on page load)
authRouter.get("/me", async (req, res) => {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentication required" });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    res.json(publicUser(payload.sub, payload.email, payload.name));
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
});
