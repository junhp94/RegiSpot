/**
 * Vancouver time helpers. Every "today"/"now" rule in the app goes through
 * here so the day-of lock and visibility never use the server's UTC clock.
 * All functions take `now` explicitly — none read the clock themselves.
 *
 * Dates are "YYYY-MM-DD" strings, times are "HH:MM" (24h), matching the
 * sessions table.
 */
export const TZ = "America/Vancouver";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_OPEN_DAYS = 5;
const DEFAULT_LENGTH_MS = 2 * 60 * 60 * 1000;

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});
const partsFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});

/** Vancouver calendar date of the instant `now`. */
export function vancouverToday(now) {
  return dateFmt.format(now); // en-CA formats as YYYY-MM-DD
}

function parseDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return { y, m, d };
}

export function addDays(dateStr, n) {
  const { y, m, d } = parseDate(dateStr);
  return new Date(Date.UTC(y, m - 1, d, 12) + n * DAY_MS).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(dateStr) {
  const { y, m, d } = parseDate(dateStr);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

// Offset (ms) of Vancouver wall time from UTC at instant `ms`.
function offsetAt(ms) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const wallAsUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wallAsUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant at which Vancouver wall clocks read `dateStr timeStr`. */
export function zonedToUtc(dateStr, timeStr) {
  const { y, m, d } = parseDate(dateStr);
  const [hh, mm] = timeStr.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let result = guess - offsetAt(guess);
  // Re-check the offset at the result to settle DST edges.
  result = guess - offsetAt(result);
  return new Date(result);
}

/**
 * Derived timing for a session row ({ date, time, end_time?, open_days_before? }).
 */
export function sessionTimes(session, now) {
  const { date, time } = session;
  const openDays = session.open_days_before ?? DEFAULT_OPEN_DAYS;
  const startsAt = zonedToUtc(date, time);
  // Wall-clock opening: same time of day, N calendar days earlier.
  const opensAt = zonedToUtc(addDays(date, -openDays), time);
  let endsAt;
  if (session.end_time) {
    endsAt = zonedToUtc(date, session.end_time);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + DAY_MS); // past midnight
  } else {
    endsAt = new Date(startsAt.getTime() + DEFAULT_LENGTH_MS);
  }
  return {
    opensAt,
    startsAt,
    endsAt,
    visible: now >= opensAt,
    locked: vancouverToday(now) >= date,
    ended: now >= endsAt,
  };
}
