/**
 * Signup routes — mounted at /groups/:groupId/sessions/:sessionId
 *   POST   /signup   → register, or join the waitlist when full
 *   DELETE /signup   → unregister (locked on the session day) / leave waitlist
 *   GET    /signups  → { registered: [...], waitlist: [...] }, each numbered
 *
 * Every write runs in a transaction that first locks the session row
 * (see lib/signupQueue.js), then promotes waitlisted players into any spot
 * that opened.
 */
import { Router } from "express";
import pool from "../lib/db.js";
import { lockSession, promote, positionOf, listSignups } from "../lib/signupQueue.js";
import { sessionTimes } from "../lib/vancouverTime.js";

export const signupsRouter = Router({ mergeParams: true });

const LOCKED_MSG = "You can't unregister on the day of the session.";

async function membership(groupId, userId) {
  const r = await pool.query(
    "SELECT nickname, role FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  return r.rows[0] || null;
}

// Runs fn(client) inside BEGIN/COMMIT. fn returns [status, body].
async function inTransaction(res, label, fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const [status, body] = await fn(client);
    await client.query(status < 400 ? "COMMIT" : "ROLLBACK");
    res.status(status).json(body);
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") return res.status(409).json({ error: "You're already signed up" });
    console.error(`${label} error:`, err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
}

// POST /groups/:groupId/sessions/:sessionId/signup
signupsRouter.post("/signup", async (req, res) => {
  const { groupId, sessionId } = req.params;
  const { userId } = req.user;

  const member = await membership(groupId, userId);
  if (!member) return res.status(403).json({ error: "You are not a member of this group" });

  await inTransaction(res, "signup", async (client) => {
    const session = await lockSession(client, groupId, sessionId);
    if (!session) return [404, { error: "Session not found" }];

    const t = sessionTimes(session, new Date());
    if (session.cancelled || t.ended) return [409, { error: "This session is closed" }];
    if (!t.visible) return [403, { error: "Registration hasn't opened yet" }];

    const existing = await client.query(
      "SELECT 1 FROM signups WHERE session_id = $1 AND user_id = $2", [sessionId, userId]
    );
    if (existing.rows[0]) return [409, { error: "You're already signed up" }];

    const hasSpot = session.signed_up_count < session.capacity;
    await client.query(
      `INSERT INTO signups (session_id, user_id, nickname, status, registered_at)
       VALUES ($1, $2, $3, $4::text, CASE WHEN $4::text = 'registered' THEN now() END)`,
      // registered_at uses the DB clock, same as promote() — mixing Node's clock skews the order
      [sessionId, userId, member.nickname, hasSpot ? "registered" : "waitlisted"]
    );
    if (hasSpot) {
      await client.query(
        "UPDATE sessions SET signed_up_count = signed_up_count + 1 WHERE id = $1", [sessionId]
      );
    }
    const pos = await positionOf(client, sessionId, userId);
    return [200, { status: pos.status, position: pos.position }];
  });
});

// DELETE /groups/:groupId/sessions/:sessionId/signup
signupsRouter.delete("/signup", async (req, res) => {
  const { groupId, sessionId } = req.params;
  const { userId } = req.user;

  if (!(await membership(groupId, userId))) {
    return res.status(403).json({ error: "You are not a member of this group" });
  }

  await inTransaction(res, "unregister", async (client) => {
    const session = await lockSession(client, groupId, sessionId);
    if (!session) return [404, { error: "Session not found" }];

    const row = await client.query(
      "SELECT status FROM signups WHERE session_id = $1 AND user_id = $2", [sessionId, userId]
    );
    const status = row.rows[0]?.status;
    if (!status) return [409, { error: "Not registered or already unregistered" }];

    if (status === "registered" && sessionTimes(session, new Date()).locked) {
      return [403, { error: LOCKED_MSG }];
    }

    await client.query("DELETE FROM signups WHERE session_id = $1 AND user_id = $2", [sessionId, userId]);
    if (status === "registered") {
      await client.query(
        "UPDATE sessions SET signed_up_count = GREATEST(signed_up_count - 1, 0) WHERE id = $1",
        [sessionId]
      );
      await promote(client, sessionId);
    }
    return [200, { success: true, was: status }];
  });
});

// GET /groups/:groupId/sessions/:sessionId/signups
signupsRouter.get("/signups", async (req, res) => {
  const { groupId, sessionId } = req.params;
  const { userId } = req.user;

  const member = await membership(groupId, userId);
  if (!member) return res.status(403).json({ error: "You are not a member of this group" });

  try {
    const s = await pool.query("SELECT 1 FROM sessions WHERE id = $1 AND group_id = $2", [sessionId, groupId]);
    if (!s.rows[0]) return res.status(404).json({ error: "Session not found" });
    res.json(await listSignups(pool, sessionId, { includeIds: member.role === "owner" }));
  } catch (err) {
    console.error("getSignups error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
