/**
 * On-request session generation. Render's free tier sleeps, so instead of a
 * timer we fill in missing sessions whenever anyone loads the session list.
 * Idempotent: the (schedule_id, date) unique index makes re-runs no-ops, and
 * cancelled sessions stay as rows so they are never regenerated.
 */
import { vancouverToday } from "./vancouverTime.js";

export const HORIZON_DAYS = 28;

/** Insert any missing sessions for the group's active schedules. Returns rows inserted. */
export async function ensureSessions(db, groupId, now) {
  const today = vancouverToday(now);
  // One statement, so a schedule paused mid-request can't have its sessions
  // recreated: `sc.active` is evaluated in the same snapshot as the insert.
  const r = await db.query(
    `INSERT INTO sessions (id, group_id, date, time, end_time, location, capacity,
                           court_count, open_days_before, schedule_id, created_by)
     SELECT substr(md5(random()::text || sc.id || d::text), 1, 12),
            sc.group_id, to_char(d, 'YYYY-MM-DD'), sc.start_time, sc.end_time, sc.location,
            sc.capacity, sc.court_count, sc.open_days_before, sc.id, g.owner_id
     FROM schedules sc
     JOIN groups g ON g.id = sc.group_id
     CROSS JOIN generate_series($2::date, $2::date + $3::int, interval '1 day') AS d
     WHERE sc.group_id = $1 AND sc.active AND extract(dow FROM d)::int = sc.weekday
     ON CONFLICT (schedule_id, date) WHERE schedule_id IS NOT NULL DO NOTHING`,
    [groupId, today, HORIZON_DAYS]
  );
  return r.rowCount;
}
