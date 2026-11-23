# Waitlist & Recurring Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Numbered signup order, a day-of unregister lock, a waitlist with automatic promotion, "add court", weekly schedules that generate sessions (visible 5 days before start), and owner Upcoming/Scheduled/Past tabs.

**Architecture:** All rules are enforced in the Express API. Every signup write locks the session row (`SELECT … FOR UPDATE`) and then calls one shared `promote()` routine. Vancouver-time maths lives in one pure module that has unit tests. Sessions are generated on request: `GET /sessions` calls `ensureSessions()`, which inserts missing rows for the next 28 days with `ON CONFLICT DO NOTHING`. There is no cron job.

**Tech Stack:** Express 4 + pg (ESM), Neon Postgres, node:test; React 18 + Vite + Tailwind tokens from `src/lib/styles.js`.

**Spec:** `docs/superpowers/specs/2026-11-23-waitlist-and-recurring-sessions-design.md`

## Global Constraints

- Time zone for every "today", "now", lock and visibility check: `America/Vancouver`, computed server-side. Never use the server's local time or UTC dates.
- Visibility: `now >= start − open_days_before days`, where start = `date` + `time` in Vancouver time and the default is `5`.
- Day-of lock starts at 00:00 Vancouver time on `date`. The lock copy is exactly: `You can't unregister on the day of the session.`
- Add court: `court_count + 1`, `capacity + 6`.
- Owner nudge when `waitlistCount >= 3`. The copy is exactly: `N waiting — add a court?`
- Generation horizon: today through today + 28 days.
- Capacity never decreases. The existing CHECK `signed_up_count <= capacity` must hold. `signed_up_count` counts **registered rows only**.
- `schema.sql` is re-run on every boot: use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` only.
- No new runtime dependencies. Use `Intl.DateTimeFormat` for time zones.
- Seed only group `SipoHV4S` (밴민턴):
  - Tue (2) 20:00–22:00, 2 courts, capacity 13
  - Sun (0) 18:00–20:00, 3 courts, capacity 18
  - Location for both: `Belvedere club, Richmond, BC`
- Backend tests: `cd server && npm test` (Neon, needs `server/.env`). Frontend checks: `npm run lint && npm run build`.

## Review Focus

1. **Kick/leave while waitlisted.** Removing a waitlisted member must not decrement `signed_up_count`. Removing a registered member must promote waitlist #1. Covered in Task 4.
2. **Evening UTC rollover.** At 23:30 Vancouver time (07:30Z the next day) "today" is still the Vancouver date. Results must stay correct across the DST change (2027-03-14). Covered in Task 1.
3. **Re-registering after unregistering while a waitlist exists.** The freed spot was already promoted, so the returning player joins the end of the waitlist and can't jump the queue. Covered in Task 2.
4. **Pausing a schedule.** Future generated sessions with zero signups are removed. Sessions with signups stay, and a paused schedule never regenerates. Covered in Task 5.
5. **Owner removal on the session day.** It succeeds despite the lock and promotes waitlist #1. Covered in Task 3.

## Before Task 1

`phase1` has many uncommitted frontend changes (including `SessionCard.jsx`, `SignupsList.jsx`, `GroupPage.jsx`) that are the owner's in-progress work. Ask the owner to commit them, or get permission to commit them as-is, then create the branch `feature/waitlist-schedules` from `phase1`. Commit the spec and this plan as the first commit on the branch.

## File Map

| File | Responsibility |
|---|---|
| `server/src/lib/vancouverTime.js` (new) | Pure time helpers |
| `server/src/lib/signupQueue.js` (new) | `lockSession`, `promote`, position queries |
| `server/src/lib/generateSessions.js` (new) | `ensureSessions` |
| `server/src/routes/schedules.js` (new) | Schedule CRUD (owner) |
| `server/src/routes/signups.js` | Signup / waitlist / lock / owner remove / add court |
| `server/src/routes/sessions.js` | Views, new fields, PATCH (edit/cancel) |
| `server/src/routes/members.js` | Leave/kick count fix + promote |
| `server/src/schema.sql` | New table and columns |
| `server/src/scripts/seedSchedules.js` (new) | One-off idempotent seed for `SipoHV4S` |
| `server/src/test/time.test.js` (new), `server/src/test/app.test.js` | Tests |
| `src/api.js`, `src/hooks/useSessions.js` | Client and state |
| `src/components/SessionCard.jsx`, `src/components/SignupsList.jsx` | Card and lists |
| `src/components/SchedulesPanel.jsx` (new), `src/pages/GroupPage.jsx`, `src/components/CreateSessionModal.jsx` | Owner UI |

---

### Task 1: Vancouver time helpers

**Files:**
- Create: `server/src/lib/vancouverTime.js`
- Create: `server/src/test/time.test.js`
- Modify: `server/package.json`. Change the `test` script to `node --test src/test/`.

**Interfaces:**
- Produces (all take an explicit `now: Date`; none read the clock themselves):
  - `TZ = "America/Vancouver"`
  - `vancouverToday(now) -> "YYYY-MM-DD"`
  - `addDays(dateStr, n) -> "YYYY-MM-DD"`
  - `weekdayOf(dateStr) -> 0..6` (0 = Sunday)
  - `zonedToUtc(dateStr, timeStr) -> Date` (the Vancouver wall time as an instant)
  - `sessionTimes(session, now) -> { opensAt: Date, startsAt: Date, endsAt: Date, visible, locked, ended }`
    - `session` has `{ date, time, end_time?, open_days_before? }`.
    - `opensAt = zonedToUtc(addDays(date, -(open_days_before ?? 5)), time)`. This is wall-clock, so it stays at 8 PM across DST.
    - Without `end_time`, `endsAt = startsAt + 2h`.
    - `locked = vancouverToday(now) >= date`.
    - `ended = now >= endsAt`.
    - `visible = now >= opensAt`.

- [ ] **Step 1: Write failing tests** in `time.test.js` (no DB import):

```js
it("evening rollover: 23:30 Vancouver is still that day", () =>
  assert.equal(vancouverToday(new Date("2026-11-25T07:30:00Z")), "2026-11-24"));
it("zonedToUtc in PST", () =>
  assert.equal(zonedToUtc("2026-11-24", "20:00").toISOString(), "2026-11-25T04:00:00.000Z"));
it("zonedToUtc in PDT after DST", () =>
  assert.equal(zonedToUtc("2027-03-16", "20:00").toISOString(), "2027-03-17T03:00:00.000Z"));
it("weekdayOf", () => { assert.equal(weekdayOf("2026-11-24"), 2); assert.equal(weekdayOf("2026-11-29"), 0); });
it("Tuesday 20:00 opens Thursday 20:00", () => {
  const t = sessionTimes({ date: "2026-12-01", time: "20:00", end_time: "22:00", open_days_before: 5 }, new Date("2026-11-27T03:59:00Z"));
  assert.equal(t.opensAt.toISOString(), "2026-11-27T04:00:00.000Z");
  assert.equal(t.visible, false);
});
it("Sunday 18:00 opens Tuesday 18:00", () =>
  assert.equal(sessionTimes({ date: "2026-11-29", time: "18:00" }, new Date()).opensAt.toISOString(), "2026-11-25T02:00:00.000Z"));
it("locked from Vancouver midnight on the date, not before", () => {
  const s = { date: "2026-11-24", time: "20:00" };
  assert.equal(sessionTimes(s, new Date("2026-11-24T07:59:00Z")).locked, false); // 23:59 on the 23rd
  assert.equal(sessionTimes(s, new Date("2026-11-24T08:00:00Z")).locked, true);  // 00:00 on the 24th
});
it("ended after end_time", () =>
  assert.equal(sessionTimes({ date: "2026-11-24", time: "20:00", end_time: "22:00" }, new Date("2026-11-25T06:00:00Z")).ended, true));
```

- [ ] **Step 2: Run** `cd server && node --test src/test/time.test.js`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `vancouverTime.js`.**
  - `vancouverToday`: use `Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })`.
  - `addDays` / `weekdayOf`: do the maths on `Date.UTC` at noon.
  - `zonedToUtc`: take the guess `g = Date.UTC(y, m-1, d, hh, mm)`. Read the Vancouver wall-clock parts of `g` via `formatToParts` (`hourCycle: "h23"`). Compute `offset = wallAsUtc(g) - g` and return `new Date(g - offset)`. Recompute the offset once at the result to settle DST edges.

- [ ] **Step 4: Run** the same command. Expected: all pass.

- [ ] **Step 5: Commit** `feat(server): Vancouver time helpers`.

---

### Task 2: Schema, waitlist signup, day-of lock, ordered lists

**Files:**
- Modify: `server/src/schema.sql`. Append exactly the SQL block from the spec's "Data model" section, including `schedules`, because the `sessions.schedule_id` FK needs it. Also add `sessions.open_days_before`.
- Create: `server/src/lib/signupQueue.js`
- Modify: `server/src/routes/signups.js`
- Modify: `server/src/test/app.test.js`

**Interfaces:**
- Consumes: `sessionTimes`, `vancouverToday`, `addDays` (Task 1).
- Produces:
  - `lockSession(client, groupId, sessionId) -> session row | null`. Runs `SELECT * … FOR UPDATE` and must be called inside BEGIN.
  - `promote(client, sessionId) -> number` (how many were promoted). While `signed_up_count < capacity`, it updates the earliest `waitlisted` row (by `signed_up_at`) to `status='registered', registered_at=now()` and increments `signed_up_count`.
  - `listSignups(db, sessionId) -> { registered: Row[], waitlist: Row[] }`, where each `Row = { userId, nickname, position, signedUpAt }`.
    - Registered rows are ordered by `COALESCE(registered_at, signed_up_at)`.
    - The waitlist is ordered by `signed_up_at`.
    - `position` starts at 1 in each list.
  - `POST /signup` returns `200 { status: "registered" | "waitlisted", position }`. Errors:
    - not visible yet → `403 { error: "Registration hasn't opened yet" }`
    - ended or `cancelled` → `409 { error: "This session is closed" }`
    - already signed up → `409 { error: "You're already signed up" }`
  - `DELETE /signup`:
    - registered and `locked` → `403 { error: "You can't unregister on the day of the session." }`
    - registered and not locked → delete, decrement, `promote`
    - waitlisted → delete, at any time
    - otherwise → the existing 409
  - `GET /signups` returns `listSignups(...)`. Include `userId` only when the caller is the owner.
  - Test helper in `app.test.js`: `vanDate(offsetDays) = addDays(vancouverToday(new Date()), offsetDays)`.

- [ ] **Step 1: Update the existing tests to use future dates.**
  - The current fixtures use `2026-06-01` and `2026-07-01`, which are now past and therefore closed. Switch them to `vanDate(1)`.
  - Also replace the "concurrent signups" test's `409` overfill expectation. The owner's second POST is now a duplicate (409), so keep it. Add a third user whose signup now returns `{ status: "waitlisted", position: 1 }`.

- [ ] **Step 2: Write failing tests.** Add `describe("waitlist and lock")` with its own owner and members A, B, C, D. In `before`, create:
  - session `S`: `{ date: vanDate(1), time: "20:00", capacity: 2 }`
  - session `T` (locked): `{ date: vanDate(0), time: "23:59", capacity: 1 }`
  - session `F` (not open): `{ date: vanDate(10), time: "20:00", capacity: 5 }`
  - session `P` (past): `{ date: vanDate(-1), time: "10:00", capacity: 5 }`

  Tests:
  - `A, B register as #1, #2; C waitlisted #1; D waitlisted #2`. Assert each POST body.
  - `GET /signups shows numbered lists`. Assert `registered.map(r => r.position)` is `[1, 2]` and `waitlist[0].nickname` is C's nickname.
  - `A unregisters the day before → C promoted to #2, D becomes waitlist #1`.
  - `Review focus 3: A re-registers → waitlisted behind D`. Assert `{ status: "waitlisted", position: 2 }`.
  - `locked: registered member on T cannot unregister`. Assert 403 and the exact copy.
  - `waitlisted member on T can leave on the day`. Fill T with one member, waitlist another, then that member's DELETE returns 200.
  - `F returns 403 "Registration hasn't opened yet"`.
  - `P returns 409 "This session is closed"`.
  - `signed_up_count equals registered rows after all of the above`, checked via `directPool`.

- [ ] **Step 3: Run** `cd server && npm test`. Expected: the new tests FAIL.

- [ ] **Step 4: Implement `signupQueue.js` and rewrite the three handlers in `signups.js`.** Each handler runs BEGIN → `lockSession` → rules → `promote` where a spot opened → COMMIT. Keep the `23505` → 409 mapping as a backstop. Remove the old conditional-UPDATE comment, and update the concurrency note in `CLAUDE.md` to describe the `FOR UPDATE` pattern.

- [ ] **Step 5: Run** `npm test`. Expected: all pass, old and new.

- [ ] **Step 6: Commit** `feat(server): waitlist, signup order and day-of lock`.

---

### Task 3: Owner remove and add court

**Files:**
- Modify: `server/src/routes/signups.js`
- Test: `server/src/test/app.test.js`

**Interfaces:**
- Consumes: `lockSession`, `promote` (Task 2).
- Produces:
  - `DELETE /groups/:groupId/sessions/:sessionId/signups/:userId`
    - owner only (non-owner → 403)
    - ignores the lock
    - deletes the target's row (404 if none), decrements only if they were registered, then `promote`s
    - returns `{ removed: true, promoted: n }`
  - `POST /groups/:groupId/sessions/:sessionId/add-court`
    - owner only
    - sets `court_count = COALESCE(court_count, 0) + 1` and `capacity = capacity + 6`, then `promote`s
    - returns `{ courtCount, capacity, promoted: n }`
    - rejects with 409 `This session is closed` if the session has ended

- [ ] **Step 1: Write failing tests** in a new `describe("owner controls")`:
  - `Review focus 5: owner removes a registered member on the session day → 200, waitlist #1 promoted`. Use a `vanDate(0)` session at `"23:59"`.
  - `non-owner cannot remove → 403`.
  - `add court on a session with capacity 2 and 3 waitlisted → capacity 8, courtCount +1, promoted 3, waitlist empty`.
  - `non-owner add-court → 403`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement both routes** in `signups.js`, using the transaction shape from Task 2.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(server): owner remove from session and add court`.

---

### Task 4: Fix leave/kick for the waitlist

**Files:**
- Modify: `server/src/routes/members.js` (both the leave and kick transactions, which currently decrement for every signup row)
- Test: `server/src/test/app.test.js`

**Interfaces:**
- Consumes: `promote` (Task 2).
- Produces: `removeUserSignupsInGroup(client, groupId, userId) -> void`, exported from `signupQueue.js`. It:
  1. deletes the user's signups in the group's sessions, `RETURNING session_id, status`;
  2. decrements `signed_up_count` once for each registered row;
  3. calls `promote` for each affected session.

  Leave and kick both call it, replacing their duplicated SQL.

- [ ] **Step 1: Write failing tests** (Review focus 1). Use a capacity-1 session with X registered and Y waitlisted:
  - `kick waitlisted Y → signed_up_count still 1, X still registered`
  - then add Z to the waitlist, and `kick registered X → Z promoted, count 1`
  - keep the existing kick test passing.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement the helper and use it in both handlers.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `fix(server): leave/kick respect waitlist and promote`.

---

### Task 5: Schedules and session generation

**Files:**
- Create: `server/src/lib/generateSessions.js`
- Create: `server/src/routes/schedules.js`
- Modify: `server/src/app.js` (mount at `/groups/:groupId/schedules`)
- Modify: `server/src/routes/sessions.js` (call `ensureSessions` at the top of GET)
- Test: `server/src/test/app.test.js`

**Interfaces:**
- Consumes: `vancouverToday`, `addDays`, `weekdayOf` (Task 1).
- Produces:
  - `ensureSessions(db, groupId, now) -> number` (rows inserted). For every `active` schedule and every date in `[today, today+28]` where `weekdayOf(date) === weekday`, it inserts a session that copies `start_time→time`, `end_time`, `location`, `capacity`, `court_count` and `open_days_before`, with `schedule_id`, `created_by = groups.owner_id`, and `ON CONFLICT (schedule_id, date) WHERE schedule_id IS NOT NULL DO NOTHING`.
  - Schedule routes. Any member may GET; everything else is owner only.
    - `GET /` → `[{ id, weekday, startTime, endTime, location, courtCount, capacity, openDaysBefore, active }]`
    - `POST /` with the same fields minus `id` and `active` → `{ id, … }`. Validate: weekday 0–6; times `HH:MM`; capacity 1–500; courtCount 1–20; openDaysBefore 1–14.
    - `PATCH /:scheduleId` with any subset of those fields plus `active`:
      - updates the schedule;
      - copies the changed fields to its future sessions (`date >= today`) that have zero signups and aren't cancelled;
      - when `active` becomes false, deletes its future sessions with zero signups.

- [ ] **Step 1: Write failing tests** in `describe("schedules")`. Use `w = weekdayOf(vanDate(2))`:
  - `owner creates schedule for weekday w → GET sessions?view=scheduled or upcoming includes a session on vanDate(2) with schedule fields`. Until Task 6 adds views, assert directly via `directPool` (`SELECT count(*) … WHERE schedule_id=$1`). Expect 4 or 5 rows for the 28-day horizon.
  - `generation is idempotent`: a second GET leaves the count unchanged.
  - `PATCH location updates future sessions without signups, not one with a signup`.
  - `Review focus 4: PATCH active=false deletes future empty sessions, keeps one with a signup; a later GET generates nothing`.
  - `member cannot POST a schedule → 403`.
  - `invalid weekday 7 → 400`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement** `generateSessions.js`, `schedules.js` and the mount. Generate session ids with the same `randomBytes(6).toString("base64url")` as `sessions.js`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(server): weekly schedules with on-request session generation`.

---

### Task 6: Session views, new fields, edit and cancel

**Files:**
- Modify: `server/src/routes/sessions.js`
- Test: `server/src/test/app.test.js`

**Interfaces:**
- Consumes: `sessionTimes` (Task 1), `ensureSessions` (Task 5).
- Produces:
  - `GET /groups/:groupId/sessions?view=…`. Members ignore `view` and always get `upcoming` minus cancelled sessions. For the owner, `view` is `upcoming` (the default), `scheduled` or `past`:
    - `upcoming`: `visible && !ended`
    - `scheduled`: `!visible`, including cancelled sessions
    - `past`: `ended`, newest first

    The other views are sorted by date/time ascending. Each item: `{ id, date, time, endTime, location, capacity, courtCount, signedUpCount, waitlistCount, myStatus, myPosition, locked, visible, ended, cancelled, scheduleId, opensAt }`, with `opensAt` as an ISO string.
  - `POST /` (manual create) accepts an optional `endTime` (`HH:MM`).
  - `PATCH /:sessionId`, owner only, accepts `{ location?, time?, endTime?, cancelled? }`. It returns the updated item and rejects with 409 if the session has ended.
  - `DELETE /:sessionId` returns 409 `Cancel generated sessions instead of deleting them` when `schedule_id` is set. Otherwise it behaves as today.

- [ ] **Step 1: Write failing tests:**
  - `member sees only visible, not-ended, not-cancelled sessions`. Using manual sessions at vanDate(1), vanDate(10) and vanDate(-1), the member sees only vanDate(1).
  - `owner views split upcoming / scheduled / past correctly`.
  - `item fields: after waitlisting, myStatus "waitlisted", myPosition 1, waitlistCount 1; locked true for a vanDate(0) session`.
  - `cancel a generated session → hidden from members, shown as cancelled in scheduled, not regenerated after another GET`.
  - `DELETE a generated session → 409`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Compute `sessionTimes` in JS per row. Group size is small, so fetch the group's sessions in a ±60-day window and filter in JS. Get `waitlistCount`, `myStatus` and `myPosition` from one query over `signups` using `ROW_NUMBER() OVER (PARTITION BY session_id, status ORDER BY …)`, with the same ordering as `listSignups`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(server): owner session views, edit and cancel`.

---

### Task 7: Seed the 밴민턴 schedules

**Files:**
- Create: `server/src/scripts/seedSchedules.js`
- Modify: `server/package.json` (add the script `"seed:schedules": "node src/scripts/seedSchedules.js"`)

**Interfaces:**
- Consumes: the `schedules` table (Task 2 schema).
- Produces: a script that loads `.env` like `migrate.js` does. It exits non-zero if group `SipoHV4S` doesn't exist. For each of the two schedules in Global Constraints, it inserts the schedule only if none exists for that `(group_id, weekday)`. It prints `inserted` or `exists` per weekday.

- [ ] **Step 1: Implement the script.**
- [ ] **Step 2: Dry-run check.** Run `node --check src/scripts/seedSchedules.js`. Expected: no output.
- [ ] **Step 3: Ask the owner before running it against Neon, since it writes production data.** After approval, run `npm run seed:schedules` twice. Expected: the first run prints `inserted` ×2 and the second prints `exists` ×2.
- [ ] **Step 4: Commit** `chore(server): seed 밴민턴 weekly schedules`.

---

### Task 8: Client API and state

**Files:**
- Modify: `src/api.js`
- Modify: `src/hooks/useSessions.js`

**Interfaces:**
- Consumes: the routes from Tasks 2, 3, 5 and 6.
- Produces:
  - `api.js` additions:
    - `getSessions(groupId, token, view?)`
    - `removeSignup(groupId, sessionId, userId, token)`
    - `addCourt(groupId, sessionId, token)`
    - `updateSession(groupId, sessionId, patch, token)`
    - `getSchedules(groupId, token)`
    - `createSchedule(groupId, body, token)`
    - `updateSchedule(groupId, scheduleId, patch, token)`
    - `createSession` passes `endTime`.
  - `useSessions(groupId, view = "upcoming")` refetches when `view` changes. It additionally returns `removeSignup(sessionId, userId)`, `addCourt(sessionId)` and `cancelSession(sessionId, cancelled)`.
  - The `signupsBySession[id]` shape becomes `{ registered, waitlist }`.
  - Signup toast: `You're registered — #N` or `You're on the waitlist — #N`, using the POST response.
  - Unregister toast: `You've been unregistered.` (as now), or `You've left the waitlist.`

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run lint`. Expected: no errors in the touched files.
- [ ] **Step 3: Commit** `feat(web): client API for waitlist, courts, schedules`.

---

### Task 9: Session card and numbered lists

**Files:**
- Modify: `src/components/SessionCard.jsx`
- Modify: `src/components/SignupsList.jsx`

**Interfaces:**
- Consumes: session item fields (Task 6) and the hook functions (Task 8).
- Produces:
  - `SessionCard` takes the new props `onRemove`, `onAddCourt` and `onCancel`.
  - `SignupsList({ signups: { registered, waitlist }, isOwner, onRemove })`.

**Behaviour (spec "UI" section):**
- Time line: `formatTime(time)–formatTime(endTime)` when `endTime` is set.
- Count line: `"{signedUpCount} of {capacity}"`, plus ` · {waitlistCount} waiting` when the waitlist is non-empty.
- Badge: `You're #N` or `Waitlist #N`.
- Button:
  - not signed up → `Register`, or `Join waitlist` when full
  - waitlisted → `Leave waitlist`
  - registered and not locked → `Unregister`
  - registered and locked → muted text `Locked on session day`
- Owner extras:
  - the nudge `N waiting — add a court?` when waitlistCount ≥ 3
  - an `Add court` button whenever the session hasn't ended
  - `Cancel session` / `Restore` for generated sessions, `Delete session` for manual ones
  - cancelled sessions show a `Cancelled` label and no signup buttons
- `SignupsList`: `Registered (n)` as a numbered list, then `Waitlist (n)` as a numbered list shown only when non-empty. Owners get a `×` remove button per row, with `aria-label="Remove {nickname}"`.

- [ ] **Step 1: Implement**, building on the owner's current versions of these files. Don't revert their uncommitted redesign.
- [ ] **Step 2: Run** `npm run lint && npm run build`. Expected: both succeed.
- [ ] **Step 3: Commit** `feat(web): numbered lists, waitlist and lock on session card`.

---

### Task 10: Owner tabs, schedules panel, end time in create

**Files:**
- Modify: `src/pages/GroupPage.jsx`
- Create: `src/components/SchedulesPanel.jsx`
- Modify: `src/components/CreateSessionModal.jsx`

**Interfaces:**
- Consumes: `useSessions(groupId, view)` (Task 8) and the schedule API functions (Task 8).
- Produces:
  - **GroupPage (owner):** a row of sub-tabs inside the Sessions tab: `Upcoming`, `Scheduled`, `Past`. It reuses the existing `TAB_ON`/`TAB_OFF` styles and drives `view`. Past cards are read-only (no buttons except `Who's going`). Members see the single list as now.
  - **Owner-only "Schedules" tab** next to Members, rendering `<SchedulesPanel groupId isOwner />`. It:
    - lists schedules as `Tuesday · 8:00–10:00 PM · Belvedere club, Richmond, BC · 2 courts · 13 spots · opens 5 days before`;
    - has an add/edit form with weekday select, start, end, location, courts, capacity and open days before;
    - has a `Pause`/`Resume` toggle.
  - **CreateSessionModal:** an optional `End time` input (`type="time"`), passed as `endTime`.
  - Empty-state copy for members: `The next session opens 5 days before it starts.`

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run lint && npm run build`. Expected: both succeed.
- [ ] **Step 3: Manual check with `npm run dev`** plus the local server (`cd server && npm run dev`). Owner: see the three tabs, create a schedule, cancel a week, add a court. Member: see only open sessions, register, join the waitlist, and see the lock on a same-day session.
- [ ] **Step 4: Commit** `feat(web): owner session tabs and schedules panel`.
