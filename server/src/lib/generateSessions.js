/**
 * On-request session generation. Render's free tier sleeps, so instead of a
 * timer we fill in missing sessions whenever anyone loads the session list.
 * Idempotent: the (schedule_id, date) unique index makes re-runs no-ops, and
 * cancelled sessions stay as rows so they are never regenerated.
 */
import { randomBytes } from "crypto";
import { vancouverToday, addDays, weekdayOf } from "./vancouverTime.js";

export const HORIZON_DAYS = 28;

/** Insert any missing sessions for the group's active schedules. Returns rows inserted. */
export async function ensureSessions(db, groupId, now) {
  const sched = await db.query(
    `SELECT sc.*, g.owner_id FROM schedules sc JOIN groups g ON g.id = sc.group_id
     WHERE sc.group_id = $1 AND sc.active`,
    [groupId]
  );
  if (sched.rows.length === 0) return 0;

  const today = vancouverToday(now);
  let inserted = 0;
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const date = addDays(today, i);
    const wd = weekdayOf(date);
    for (const s of sched.rows) {
      if (s.weekday !== wd) continue;
      const r = await db.query(
        `INSERT INTO sessions (id, group_id, date, time, end_time, location, capacity,
                               court_count, open_days_before, schedule_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (schedule_id, date) WHERE schedule_id IS NOT NULL DO NOTHING`,
        [randomBytes(6).toString("base64url"), groupId, date, s.start_time, s.end_time,
          s.location, s.capacity, s.court_count, s.open_days_before, s.id, s.owner_id]
      );
      inserted += r.rowCount;
    }
  }
  return inserted;
}
