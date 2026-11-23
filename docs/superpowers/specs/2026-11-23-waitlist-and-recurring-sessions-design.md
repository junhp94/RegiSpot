# Waitlist, signup order, day-of lock, and recurring sessions

Date: 2026-11-23 · Status: draft, awaiting owner approval

## Intent

RegiSpot is used only by Vanminton. The owner runs two fixed sessions each week
and today creates every one by hand. Players drop out at the last minute, and once
a session is full, extra players have no way to queue for a spot. This change:

1. Shows a clear signup order (#1, #2, …).
2. Stops registered players from unregistering on the session day.
3. Adds a waitlist with automatic promotion.
4. Generates the weekly sessions automatically. Members see a session only 5 days ahead.
5. Lets the owner add a court (+6 spots) when the waitlist is long.
6. Gives the owner Upcoming / Scheduled / Past tabs.

## Goals

- **Numbered order.** Registered players are numbered in signup order. Each player sees their own position
  ("You're #7" / "Waitlist #2").
- **Day-of lock.** From 00:00 America/Vancouver on the session date, a registered player cannot
  unregister. The server enforces this; the UI hides or disables the button and explains why.
- **Waitlist.** When the session is full, Register becomes "Join waitlist". Waitlisted players
  can leave at any time, including on the session day.
- **Automatic promotion.** Whenever a spot opens, the earliest waitlisted player moves into
  it, in the same transaction. A spot opens when a player unregisters before the session day,
  when the owner removes someone, or when the owner adds a court.
- **Owner can remove anyone**, on any day. This is the only exception to the day-of lock.
- **Recurring schedules:**
  - Tuesday 20:00–22:00, 2 courts, capacity 13
  - Sunday 18:00–20:00, 3 courts, capacity 18

  Both are at "Belvedere club, Richmond, BC". These two schedules are seeded for the 밴민턴
  group (id `SipoHV4S`, the canonical group) (idempotent; skipped if a schedule for that weekday already exists). The owner can still
  edit them in the schedules panel.
- **Visibility.** A session becomes visible to members, and open for registration, exactly
  5 days before its start time (Vancouver time):
  - Tuesday 20:00 → opens Thursday 20:00
  - Sunday 18:00 → opens Tuesday 18:00

  The 5 days is stored per schedule (`open_days_before`, default 5). One-off sessions use 5.
- **Add court.** The owner taps "Add court" on a session: court_count +1, capacity +6,
  then the waitlist is promoted into the new spots. When 3 or more players are waitlisted, the
  owner's card shows a nudge: "N waiting — add a court?"
- **Owner tabs:**
  - **Upcoming:** visible to members now and not yet over.
  - **Scheduled:** further out, not yet visible to members. The owner can edit or cancel these.
  - **Past:** already ended. Read-only, with the final registered list.

## Non-goals

- Notifications (email or push) when promoted. Players see it next time they open the app.
- Removing a court or lowering capacity below the registered count.
- Members seeing past sessions.
- A paid Render cron job.

## Anti-goals (failure even if it "works")

- Unregistering on the day still possible through a direct API call.
- The day-of boundary computed in UTC. That flips at 4 PM Vancouver time.
- Two people promoted into one spot, or the count drifting from the real signups.
- A cancelled week coming back because generation recreates it.

## Constraints

- Express on the Render free tier sleeps when idle, so timer-based jobs are unreliable.
- `sessions.date` and `sessions.time` are TEXT (`YYYY-MM-DD`, `HH:MM`). All "today" and "now"
  logic must use America/Vancouver, computed server-side.
- `schema.sql` is re-applied on every startup, so new columns use `ADD COLUMN IF NOT EXISTS`.
- The existing CHECK `signed_up_count <= capacity` stays valid. Capacity only goes up.
- The existing integration test suite (Neon) must keep passing. New behaviour gets tests there.

## Approaches considered

- **A. Schedule templates plus generation on request (chosen).** The owner defines a weekly
  schedule. When anyone loads sessions, the server creates any missing sessions within a
  rolling horizon. No timer is needed, it never runs out, and one edit changes all future weeks.
- **B. Bulk-create a year of sessions with a "visible from" date.** Simpler, but a
  time or location change means editing up to 52 rows, and it has to be redone every year. Rejected.
- **C. Paid Render cron job.** It costs money and gives nothing over A. Rejected.

The owner picked A.

## Design

### Data model (schema.sql additions)

```sql
CREATE TABLE IF NOT EXISTS schedules (
  id           TEXT PRIMARY KEY,
  group_id     TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  weekday      INT  NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sunday
  start_time   TEXT NOT NULL,   -- "20:00"
  end_time     TEXT NOT NULL,   -- "22:00"
  location     TEXT NOT NULL,
  court_count  INT  NOT NULL,
  capacity     INT  NOT NULL CHECK (capacity BETWEEN 1 AND 500),
  open_days_before INT NOT NULL DEFAULT 5,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS end_time    TEXT;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancelled   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS open_days_before INT NOT NULL DEFAULT 5;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_schedule_date_idx
  ON sessions (schedule_id, date) WHERE schedule_id IS NOT NULL;

ALTER TABLE signups ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'registered'
  CHECK (status IN ('registered', 'waitlisted'));
ALTER TABLE signups ADD COLUMN IF NOT EXISTS registered_at TIMESTAMPTZ;  -- set on register/promotion
```

- `signed_up_count` counts only `registered` rows.
- The registered order is `registered_at` (falling back to `signed_up_at` for existing rows).
  The waitlist order is `signed_up_at`.

### Session generation

- Runs inside `GET /groups/:groupId/sessions`, before the query, as an idempotent
  `INSERT … ON CONFLICT DO NOTHING` per active schedule.
- Covers each matching weekday from today (Vancouver time) to **today + 28 days**. The rolling
  4-week horizon gives the owner real rows to edit or cancel in the Scheduled tab.
- Cancelling a generated session sets `cancelled = true` instead of deleting the row, so it is
  never regenerated. Manual one-off sessions (the existing create form) still work and can still be deleted.
- Editing a schedule updates its future sessions that have no registrations yet. Sessions that
  already have signups keep their values; the owner can edit those individually.

### Visibility and lists

These are computed server-side with Vancouver `today`/`now`:

- `visible` = `now >= (date + time) − open_days_before days`
- `ended` = now is past `date` + `end_time` (or `time` if there's no end time)

Who sees what:

- **Members:** `GET sessions` returns sessions that are visible, not ended, and not cancelled.
- **Owner:** `GET sessions?view=upcoming|scheduled|past` returns the matching set.
  Scheduled includes cancelled sessions, marked as cancelled.

Each session in the response carries `registeredCount`, `waitlistCount`,
`myStatus` (`registered` | `waitlisted` | null), `myPosition`, and `locked` (it's the session day).

### Signup transactions

Every write locks the session row first (`SELECT … FOR UPDATE`), then:

- **POST /signup.** Reject if the session isn't visible, has ended, or is cancelled. If
  registered < capacity, insert as `registered` and increment the count. Otherwise insert as
  `waitlisted`. The response returns `{ status, position }`.
- **DELETE /signup:**
  - Registered and it's the session day → 403 "You can't unregister on the day of the session."
  - Registered on an earlier day → delete the row and promote.
  - Waitlisted → delete the row at any time.
- **Owner DELETE `/sessions/:sessionId/signups/:userId`** (new). Removes anyone, ignores the lock, then promotes.
- **Owner POST `/sessions/:sessionId/add-court`** (new). court_count +1, capacity +6, then promotes.
- **promote(sessionId):** while registered < capacity and the waitlist is not empty, move the
  earliest waitlisted row to `registered`, set `registered_at = now()`, and increment the count.

### UI

- **SessionCard.** The badge shows "You're #7", "Waitlist #2", or nothing.
  - The main button reads Register, Join waitlist, or Leave waitlist.
  - When locked, Unregister is replaced by the muted text "Locked on session day".
  - The count line reads "13 of 13 · 4 waiting".
  - Owners also get: an "Add court" button, the nudge when 3 or more are waiting, and Cancel
    (generated sessions) or Delete (manual sessions).
- **SignupsList.** A numbered "Registered" list and a numbered "Waitlist" list. Owners get a
  remove (×) button on each row.
- **GroupPage, owner view.** Tabs: Upcoming / Scheduled / Past. Members see one list with no tabs.
- **Schedules.** A small owner-only "Weekly schedules" panel to add, edit, and pause a schedule
  (weekday, start, end, location, courts, capacity).

## Left to the builder (marked calls)

- Exact API field names and route shapes beyond those above.
- Whether generation is throttled (e.g. at most once per minute per group). It's cheap either way.
- Copy wording, and exact styling within the existing Tailwind tokens.
- How the existing one-off "Create session" modal gains an optional end time.
