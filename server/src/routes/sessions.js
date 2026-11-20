/**
 * Session routes — GET/POST /groups/:groupId/sessions,
 * DELETE /groups/:groupId/sessions/:sessionId
 */
import { Router } from "express";
import { randomBytes } from "crypto";
import pool from "../lib/db.js";
import {
  sanitizeString,
  isValidMatchFormat,
  isValidSkillLevel,
  RACKET_SPORTS,
} from "../lib/validators.js";

export const sessionsRouter = Router({ mergeParams: true });

// GET /groups/:groupId/sessions
sessionsRouter.get("/", async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.user;

  try {
    // Verify membership
    const memberRes = await pool.query(
      "SELECT 1 FROM members WHERE group_id = $1 AND user_id = $2",
      [groupId, userId]
    );
    if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });

    const sessRes = await pool.query(
      `SELECT id, date, time, location, capacity, signed_up_count,
              match_format, skill_level, court_count
       FROM sessions WHERE group_id = $1 ORDER BY date ASC, time ASC`,
      [groupId]
    );
    const sessions = sessRes.rows;

    // Check which sessions the caller is registered for
    if (sessions.length > 0) {
      const ids = sessions.map((s) => s.id);
      const signedRes = await pool.query(
        `SELECT session_id FROM signups
         WHERE session_id = ANY($1) AND user_id = $2`,
        [ids, userId]
      );
      const registeredSet = new Set(signedRes.rows.map((r) => r.session_id));
      sessions.forEach((s) => { s.isRegistered = registeredSet.has(s.id); });
    }

    res.json(sessions.map((s) => ({
      id: s.id,
      date: s.date,
      time: s.time,
      location: s.location,
      capacity: s.capacity,
      signedUpCount: s.signed_up_count,
      isRegistered: s.isRegistered ?? false,
      ...(s.match_format && { matchFormat: s.match_format }),
      ...(s.skill_level && { skillLevel: s.skill_level }),
      ...(s.court_count && { courtCount: s.court_count }),
    })));
  } catch (err) {
    console.error("getSessions error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /groups/:groupId/sessions
sessionsRouter.post("/", async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.user;

  // Verify membership and owner role
  const memberRes = await pool.query(
    "SELECT role FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });
  if (memberRes.rows[0].role !== "owner") return res.status(403).json({ error: "Only the group owner can create sessions" });

  const { date, time, location, capacity, matchFormat, skillLevel, courtCount } = req.body || {};

  const cleanDate = sanitizeString(date, 20);
  const cleanTime = sanitizeString(time, 20);
  const cleanLocation = sanitizeString(location, 100);
  const cap = Number(capacity);

  if (!cleanDate) return res.status(400).json({ error: "date is required" });
  if (!cleanTime) return res.status(400).json({ error: "time is required" });
  if (!cleanLocation) return res.status(400).json({ error: "location is required" });
  if (!cap || cap < 1 || cap > 500) return res.status(400).json({ error: "capacity must be between 1 and 500" });

  // Sport-specific optional fields
  const groupRes = await pool.query("SELECT sport_type FROM groups WHERE id = $1", [groupId]);
  const sportType = groupRes.rows[0]?.sport_type;

  let mf = null, sl = null, cc = null;
  if (sportType && RACKET_SPORTS.includes(sportType)) {
    if (matchFormat) {
      if (!isValidMatchFormat(matchFormat)) return res.status(400).json({ error: "Invalid matchFormat" });
      mf = matchFormat;
    }
    if (skillLevel) {
      if (!isValidSkillLevel(skillLevel)) return res.status(400).json({ error: "Invalid skillLevel" });
      sl = skillLevel;
    }
    if (courtCount != null && courtCount !== "") {
      const n = Number(courtCount);
      if (!Number.isInteger(n) || n < 1 || n > 20) return res.status(400).json({ error: "courtCount must be between 1 and 20" });
      cc = n;
    }
  }

  const sessionId = randomBytes(6).toString("base64url");
  try {
    await pool.query(
      `INSERT INTO sessions (id, group_id, date, time, location, capacity,
        match_format, skill_level, court_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [sessionId, groupId, cleanDate, cleanTime, cleanLocation, cap, mf, sl, cc, userId]
    );
  } catch (err) {
    console.error("createSession error:", err);
    return res.status(500).json({ error: "Server error" });
  }

  res.json({
    sessionId,
    date: cleanDate,
    time: cleanTime,
    location: cleanLocation,
    capacity: cap,
    ...(mf && { matchFormat: mf }),
    ...(sl && { skillLevel: sl }),
    ...(cc && { courtCount: cc }),
  });
});

// DELETE /groups/:groupId/sessions/:sessionId
sessionsRouter.delete("/:sessionId", async (req, res) => {
  const { groupId, sessionId } = req.params;
  const { userId } = req.user;

  const memberRes = await pool.query(
    "SELECT role FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });
  if (memberRes.rows[0].role !== "owner") return res.status(403).json({ error: "Only the group owner can delete sessions" });

  try {
    // ON DELETE CASCADE in signups table handles cleanup automatically
    const result = await pool.query(
      "DELETE FROM sessions WHERE id = $1 AND group_id = $2 RETURNING id",
      [sessionId, groupId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Session not found" });
    res.json({ deleted: true });
  } catch (err) {
    console.error("deleteSession error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
