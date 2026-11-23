/**
 * Session routes — GET/POST /groups/:groupId/sessions,
 * DELETE /groups/:groupId/sessions/:sessionId
 */
import { Router } from "express";
import { randomBytes } from "crypto";
import pool from "../lib/db.js";
import { ensureSessions } from "../lib/generateSessions.js";
import { sessionTimes, vancouverToday, addDays } from "../lib/vancouverTime.js";
import {
  sanitizeString,
  isValidMatchFormat,
  isValidSkillLevel,
  RACKET_SPORTS,
} from "../lib/validators.js";

export const sessionsRouter = Router({ mergeParams: true });

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Shape a session row for the API. `mine` = { status, position } or undefined.
function toItem(s, times, counts, mine) {
  return {
    id: s.id,
    date: s.date,
    time: s.time,
    endTime: s.end_time ?? null,
    location: s.location,
    capacity: s.capacity,
    courtCount: s.court_count ?? null,
    signedUpCount: s.signed_up_count,
    waitlistCount: counts?.waitlisted ?? 0,
    myStatus: mine?.status ?? null,
    myPosition: mine?.position ?? null,
    isRegistered: mine?.status === "registered", // kept for older clients
    locked: times.locked,
    visible: times.visible,
    ended: times.ended,
    cancelled: s.cancelled,
    scheduleId: s.schedule_id ?? null,
    opensAt: times.opensAt.toISOString(),
    ...(s.match_format && { matchFormat: s.match_format }),
    ...(s.skill_level && { skillLevel: s.skill_level }),
  };
}

// Waitlist counts per session and the caller's status/position, for a set of session ids.
async function signupInfo(ids, userId) {
  if (ids.length === 0) return { counts: new Map(), mine: new Map() };
  const r = await pool.query(
    `SELECT session_id, user_id, status,
            ROW_NUMBER() OVER (PARTITION BY session_id, status ORDER BY
              CASE WHEN status = 'registered' THEN COALESCE(registered_at, signed_up_at) ELSE signed_up_at END,
              user_id)::int AS position
     FROM signups WHERE session_id = ANY($1)`,
    [ids]
  );
  const counts = new Map();
  const mine = new Map();
  for (const row of r.rows) {
    const c = counts.get(row.session_id) ?? { registered: 0, waitlisted: 0 };
    c[row.status] += 1;
    counts.set(row.session_id, c);
    if (row.user_id === userId) mine.set(row.session_id, { status: row.status, position: row.position });
  }
  return { counts, mine };
}

const VIEWS = ["upcoming", "scheduled", "past"];
const WINDOW_DAYS = 60;

// GET /groups/:groupId/sessions[?view=upcoming|scheduled|past]
// Members always get upcoming (visible, not ended, not cancelled). Owners pick a view;
// owner views include cancelled sessions, marked, in whichever tab their timing puts them.
sessionsRouter.get("/", async (req, res) => {
  const { groupId } = req.params;
  const { userId } = req.user;

  try {
    const memberRes = await pool.query(
      "SELECT role FROM members WHERE group_id = $1 AND user_id = $2",
      [groupId, userId]
    );
    if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });
    const isOwner = memberRes.rows[0].role === "owner";
    const view = isOwner && VIEWS.includes(req.query.view) ? req.query.view : "upcoming";

    const now = new Date();
    await ensureSessions(pool, groupId, now);

    const today = vancouverToday(now);
    const sessRes = await pool.query(
      `SELECT * FROM sessions WHERE group_id = $1 AND date BETWEEN $2 AND $3
       ORDER BY date ASC, time ASC`,
      [groupId, addDays(today, -WINDOW_DAYS), addDays(today, WINDOW_DAYS)]
    );

    let rows = sessRes.rows.map((s) => ({ s, t: sessionTimes(s, now) }));
    if (view === "upcoming") rows = rows.filter(({ t }) => t.visible && !t.ended);
    if (view === "scheduled") rows = rows.filter(({ t }) => !t.visible);
    if (view === "past") rows = rows.filter(({ t }) => t.ended).reverse();
    if (!isOwner) rows = rows.filter(({ s }) => !s.cancelled);

    const { counts, mine } = await signupInfo(rows.map(({ s }) => s.id), userId);
    res.json(rows.map(({ s, t }) => toItem(s, t, counts.get(s.id), mine.get(s.id))));
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

  const { date, time, endTime, location, capacity, matchFormat, skillLevel, courtCount } = req.body || {};

  const cleanDate = sanitizeString(date, 20);
  const cleanTime = sanitizeString(time, 20);
  const cleanLocation = sanitizeString(location, 100);
  const cap = Number(capacity);

  if (!cleanDate) return res.status(400).json({ error: "date is required" });
  if (!cleanTime) return res.status(400).json({ error: "time is required" });
  if (!cleanLocation) return res.status(400).json({ error: "location is required" });
  if (!cap || cap < 1 || cap > 500) return res.status(400).json({ error: "capacity must be between 1 and 500" });
  if (endTime != null && endTime !== "" && !TIME_RE.test(endTime)) {
    return res.status(400).json({ error: "endTime must be HH:MM" });
  }
  const cleanEnd = endTime || null;

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
      `INSERT INTO sessions (id, group_id, date, time, end_time, location, capacity,
        match_format, skill_level, court_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [sessionId, groupId, cleanDate, cleanTime, cleanEnd, cleanLocation, cap, mf, sl, cc, userId]
    );
  } catch (err) {
    console.error("createSession error:", err);
    return res.status(500).json({ error: "Server error" });
  }

  res.json({
    sessionId,
    date: cleanDate,
    time: cleanTime,
    endTime: cleanEnd,
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
    const found = await pool.query(
      "SELECT schedule_id FROM sessions WHERE id = $1 AND group_id = $2", [sessionId, groupId]
    );
    if (!found.rows[0]) return res.status(404).json({ error: "Session not found" });
    // A deleted generated session would just be regenerated — cancel it instead.
    if (found.rows[0].schedule_id) {
      return res.status(409).json({ error: "Cancel generated sessions instead of deleting them" });
    }
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

// PATCH /groups/:groupId/sessions/:sessionId  (owner) — { location?, time?, endTime?, cancelled? }
sessionsRouter.patch("/:sessionId", async (req, res) => {
  const { groupId, sessionId } = req.params;
  const { userId } = req.user;

  const memberRes = await pool.query(
    "SELECT role FROM members WHERE group_id = $1 AND user_id = $2",
    [groupId, userId]
  );
  if (!memberRes.rows[0]) return res.status(403).json({ error: "You are not a member of this group" });
  if (memberRes.rows[0].role !== "owner") return res.status(403).json({ error: "Only the group owner can edit sessions" });

  const body = req.body || {};
  const sets = {};
  if (body.location !== undefined) {
    const loc = sanitizeString(body.location, 100);
    if (!loc) return res.status(400).json({ error: "Invalid location" });
    sets.location = loc;
  }
  if (body.time !== undefined) {
    if (!TIME_RE.test(body.time)) return res.status(400).json({ error: "time must be HH:MM" });
    sets.time = body.time;
  }
  if (body.endTime !== undefined) {
    if (body.endTime !== null && !TIME_RE.test(body.endTime)) return res.status(400).json({ error: "endTime must be HH:MM" });
    sets.end_time = body.endTime;
  }
  if (body.cancelled !== undefined) {
    if (typeof body.cancelled !== "boolean") return res.status(400).json({ error: "Invalid cancelled" });
    sets.cancelled = body.cancelled;
  }
  const cols = Object.keys(sets);
  if (cols.length === 0) return res.status(400).json({ error: "Nothing to update" });

  try {
    const cur = await pool.query("SELECT * FROM sessions WHERE id = $1 AND group_id = $2", [sessionId, groupId]);
    if (!cur.rows[0]) return res.status(404).json({ error: "Session not found" });
    if (sessionTimes(cur.rows[0], new Date()).ended) return res.status(409).json({ error: "This session is closed" });

    const upd = await pool.query(
      `UPDATE sessions SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}
       WHERE id = $1 AND group_id = $2 RETURNING *`,
      [sessionId, groupId, ...Object.values(sets)]
    );
    const s = upd.rows[0];
    const { counts, mine } = await signupInfo([s.id], userId);
    res.json(toItem(s, sessionTimes(s, new Date()), counts.get(s.id), mine.get(s.id)));
  } catch (err) {
    console.error("updateSession error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
