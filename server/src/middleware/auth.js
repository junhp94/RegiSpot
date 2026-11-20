/**
 * JWT auth middleware — replaces API Gateway's Cognito authorizer.
 * Every route except /auth/* and /health requires a valid Bearer token.
 * On success it sets req.user = { userId, email, name } so route handlers
 * can read the caller identity exactly like the old getAuthUser(event) helper.
 */
import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers["authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { userId: payload.sub, email: payload.email, name: payload.name };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
