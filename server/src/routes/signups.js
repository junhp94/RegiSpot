/**
 * Signup routes — mounted at /groups/:groupId/sessions/:sessionId
 *   POST   /signup   → register
 *   DELETE /signup   → unregister
 *   GET    /signups  → list signups
 *
 * Concurrency guarantee: signup uses a conditional UPDATE in a transaction.
 * UPDATE ... WHERE signed_up_count < capacity RETURNING id
 * Zero rows returned → session is full (or doesn't exist).
 * The (session_id, user_id) PRIMARY KEY then catches duplicate signups.
 * This mirrors the DynamoDB TransactWrite pattern:
 *   condition check on capacity + conditional put for uniqueness.
 */
import { Router } from "express";
import pool from "../lib/db.js";

export const signupsRouter = Router({ mergeParams: true });

// POST /groups/:groupId/sessions/:sessionId/signup
signupsRouter.post("/signup", async (req, res) => {
  const { groupId, sessionId } = req.params;
  const { userId } = req.user;

  const memberRes = await pool.query(
    "SELECT nickname FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });
  const { nickname } = memberRes.rows[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Atomically increment only if capacity not reached
    const upd = await client.query(
      `UPDATE sessions
       SET signed_up_count = signed_up_count + 1
       WHERE id = $1 AND group_id = $2 AND signed_up_count < capacity
       RETURNING id`,
      [sessionId, groupId]
    );
    if (upd.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Duplicate signup or session full" });
    }

    // Insert signup row; unique PK catches duplicate signups
    await client.query(
      `INSERT INTO signups (session_id, user_id, nickname) VALUES ($1,$2,$3)`,
      [sessionId, userId, nickname]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ error: "Duplicate signup or session full" });
    }
    console.error("signup error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// DELETE /groups/:groupId/sessions/:sessionId/signup
signupsRouter.delete("/signup", async (req, res) => {
  const { groupId, sessionId } = req.params;
  const { userId } = req.user;

  const memberRes = await pool.query(
    "SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const del = await client.query(
      "DELETE FROM signups WHERE session_id = $1 AND user_id = $2 RETURNING session_id",
      [sessionId, userId]
    );
    if (del.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Not registered or already unregistered" });
    }

    await client.query(
      `UPDATE sessions SET signed_up_count = GREATEST(signed_up_count - 1, 0)
       WHERE id = $1`,
      [sessionId]
    );

    await client.query("COMMIT");
    res.json({ success: true });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("unregister error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});

// GET /groups/:groupId/sessions/:sessionId/signups
signupsRouter.get("/signups", async (req, res) => {
  const { groupId, sessionId } = req.params;
  const { userId } = req.user;

  const memberRes = await pool.query(
    "SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });

  try {
    const result = await pool.query(
      `SELECT s.nickname, s.signed_up_at AS "signedUpAt"
       FROM signups s
       JOIN sessions sess ON sess.id = s.session_id
       WHERE s.session_id = $1 AND sess.group_id = $2
       ORDER BY s.signed_up_at ASC`,
      [sessionId, groupId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("getSignups error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
