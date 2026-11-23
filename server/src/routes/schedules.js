/**
 * Weekly schedule routes — mounted at /groups/:groupId/schedules
 *   GET    /             → list (any member)
 *   POST   /             → create (owner)
 *   PATCH  /:scheduleId  → edit / pause / resume (owner)
 *
 * Edits copy to future generated sessions that nobody has signed up for yet;
 * sessions with signups keep their values (the owner edits those one by one).
 * Pausing deletes future generated sessions with zero signups.
 */
import { Router } from "express";
import { randomBytes } from "crypto";
import pool from "../lib/db.js";
import { sanitizeString } from "../lib/validators.js";
import { vancouverToday } from "../lib/vancouverTime.js";

export const schedulesRouter = Router({ mergeParams: true });

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// camelCase API field → [column, validator(value) → cleaned value | undefined]
const FIELDS = {
  weekday: ["weekday", (v) => (Number.isInteger(v) && v >= 0 && v <= 6 ? v : undefined)],
  startTime: ["start_time", (v) => (TIME_RE.test(v ?? "") ? v : undefined)],
  endTime: ["end_time", (v) => (TIME_RE.test(v ?? "") ? v : undefined)],
  location: ["location", (v) => sanitizeString(v, 100) || undefined],
  courtCount: ["court_count", (v) => (Number.isInteger(v) && v >= 1 && v <= 20 ? v : undefined)],
  capacity: ["capacity", (v) => (Number.isInteger(v) && v >= 1 && v <= 500 ? v : undefined)],
  openDaysBefore: ["open_days_before", (v) => (Number.isInteger(v) && v >= 1 && v <= 14 ? v : undefined)],
};
// Schedule columns that are copied onto generated sessions (schedule col → session col)
const SESSION_COPY = {
  start_time: "time", end_time: "end_time", location: "location",
  court_count: "court_count", capacity: "capacity", open_days_before: "open_days_before",
};

function toApi(r) {
  return {
    id: r.id, weekday: r.weekday, startTime: r.start_time, endTime: r.end_time,
    location: r.location, courtCount: r.court_count, capacity: r.capacity,
    openDaysBefore: r.open_days_before, active: r.active,
  };
}

// Parses the given subset of fields. Returns { values } or { error }.
function parse(body, required) {
  const values = {};
  for (const [key, [col, check]] of Object.entries(FIELDS)) {
    const raw = body?.[key];
    if (raw === undefined) {
      if (required && key !== "openDaysBefore") return { error: `${key} is required` };
      continue;
    }
    const v = check(raw);
    if (v === undefined) return { error: `Invalid ${key}` };
    values[col] = v;
  }
  return { values };
}

async function roleOf(groupId, userId) {
  const r = await pool.query("SELECT role FROM members WHERE group_id = $1 AND user_id = $2", [groupId, userId]);
  return r.rows[0]?.role ?? null;
}

async function requireOwner(req, res) {
  const role = await roleOf(req.params.groupId, req.user.userId);
  if (!role) { res.status(403).json({ error: "You are not a member of this group" }); return false; }
  if (role !== "owner") { res.status(403).json({ error: "Only the group owner can manage schedules" }); return false; }
  return true;
}

schedulesRouter.get("/", async (req, res) => {
  if (!(await roleOf(req.params.groupId, req.user.userId))) {
    return res.status(403).json({ error: "You are not a member of this group" });
  }
  try {
    const r = await pool.query(
      "SELECT * FROM schedules WHERE group_id = $1 ORDER BY weekday, start_time", [req.params.groupId]
    );
    res.json(r.rows.map(toApi));
  } catch (err) {
    console.error("getSchedules error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

schedulesRouter.post("/", async (req, res) => {
  if (!(await requireOwner(req, res))) return;
  const { values, error } = parse(req.body, true);
  if (error) return res.status(400).json({ error });
  values.open_days_before ??= 5;

  try {
    const cols = Object.keys(values);
    const r = await pool.query(
      `INSERT INTO schedules (id, group_id, ${cols.join(", ")})
       VALUES ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(", ")}) RETURNING *`,
      [randomBytes(6).toString("base64url"), req.params.groupId, ...Object.values(values)]
    );
    res.json(toApi(r.rows[0]));
  } catch (err) {
    console.error("createSchedule error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

schedulesRouter.patch("/:scheduleId", async (req, res) => {
  if (!(await requireOwner(req, res))) return;
  const { groupId, scheduleId } = req.params;
  const { values, error } = parse(req.body, false);
  if (error) return res.status(400).json({ error });
  const active = req.body?.active;
  if (active !== undefined && typeof active !== "boolean") return res.status(400).json({ error: "Invalid active" });
  if (active !== undefined) values.active = active;
  if (Object.keys(values).length === 0) return res.status(400).json({ error: "Nothing to update" });

  const today = vancouverToday(new Date());
  // Future generated sessions with no signups (registered or waitlisted)
  const EMPTY_FUTURE = `schedule_id = $1 AND date >= $2 AND NOT cancelled
    AND NOT EXISTS (SELECT 1 FROM signups su WHERE su.session_id = sessions.id)`;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cols = Object.keys(values);
    const upd = await client.query(
      `UPDATE schedules SET ${cols.map((c, i) => `${c} = $${i + 3}`).join(", ")}
       WHERE id = $1 AND group_id = $2 RETURNING *`,
      [scheduleId, groupId, ...Object.values(values)]
    );
    if (!upd.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Schedule not found" });
    }

    // Lock this schedule's future sessions first: signup writes hold the same row lock,
    // so after this point the NOT EXISTS(signups) checks below can't miss a new signup.
    await client.query(
      "SELECT id FROM sessions WHERE schedule_id = $1 AND date >= $2 ORDER BY id FOR UPDATE",
      [scheduleId, today]
    );

    const copy = cols.filter((c) => SESSION_COPY[c]);
    if (copy.length > 0) {
      await client.query(
        `UPDATE sessions SET ${copy.map((c) => `${SESSION_COPY[c]} = sc.${c}`).join(", ")}
         FROM schedules sc WHERE sc.id = $1 AND ${EMPTY_FUTURE}`,
        [scheduleId, today]
      );
    }
    if (active === false) {
      await client.query(`DELETE FROM sessions WHERE ${EMPTY_FUTURE}`, [scheduleId, today]);
    }
    // A changed weekday leaves old-weekday sessions behind; drop the empty ones.
    if (values.weekday !== undefined) {
      await client.query(
        `DELETE FROM sessions WHERE ${EMPTY_FUTURE} AND extract(dow FROM date::date) <> $3`,
        [scheduleId, today, values.weekday]
      );
    }
    await client.query("COMMIT");
    res.json(toApi(upd.rows[0]));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("updateSchedule error:", err);
    res.status(500).json({ error: "Server error" });
  } finally {
    client.release();
  }
});
