# Guest Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A member taps "Register for a guest", types a name, and the guest is registered or waitlisted under the same queue rules as members. Guests get no account and no access.

**Architecture:** Guests are rows in `signups` with `user_id NULL`, `guest_name` set, and `added_by` set to the host. `signups` gets a surrogate `id` primary key. The existing queue code switches from keying rows by `user_id` to keying them by `id`, so promotion, ordering, counts and the lock cover guests with no second code path.

**Tech Stack:** Express 4 + pg, Neon Postgres, node:test, React + Vite.

**Spec:** `docs/superpowers/specs/2026-11-23-guest-registration-design.md` (builds on `2026-11-23-waitlist-and-recurring-sessions-design.md`)

## Global Constraints

- Guests have no account and no access. Never create `users` or `members` rows for them.
- Guest name: trimmed, 1–40 characters. Otherwise return 400 `Guest name must be 1–40 characters`.
- Display form: `{guestName} (guest of {hostNickname})`.
- The day-of lock (`You can't unregister on the day of the session.`) applies when a host removes their *registered* guest. The owner is exempt.
- No limit on guests per member, and the host need not be registered.
- `schema.sql` must stay idempotent, and it must stay compatible with the currently deployed server: old code inserts without `id` and relies on 23505 for a duplicate member signup.
- **All test runs in this plan use a Neon branch, not production.** Set `DATABASE_URL` and `DATABASE_URL_UNPOOLED` from the `guests-test` branch for every `npm test`.
- Ordering tiebreak: `id` replaces `user_id`. `REGISTERED_ORDER = "COALESCE(registered_at, signed_up_at), signed_up_at, id"` and `WAITLIST_ORDER = "signed_up_at, id"`.

## Review Focus

1. **Migration on real data.** Existing prod signups keep their rows, get an `id`, and a second run of `schema.sql` changes nothing. Covered in Task 1, step 6, on a copy of prod.
2. **Host leaves the group while their guest is locked in on the session day.** Leaving must be refused. Covered in Task 3.
3. **Two guests with the same name from the same host.** Both are allowed and removed independently by `guestId`. Covered in Task 2.
4. **A member who is also a host unregisters themselves.** Their guests stay put. Covered in Task 2.
5. **Kick or leave of a host.** Their guests in today-or-later sessions are removed and promoted, while past rows remain. Covered in Task 3.

## Before Task 1

- Fetch `main` over HTTPS (`git fetch https://github.com/junhp94/RegiSpot.git main:refs/remotes/origin/main`).
- Create the branch `feature/guests` from `origin/main`.
- Commit the spec and this plan.
- Create a Neon test branch from production: `neon branches create --name guests-test` (default parent; the neon.ts policy gives it a 7-day TTL).
- Get its connection strings with `neon connection-string guests-test` (pooled and `--pooled false`), and export both env vars in the test shell only. **Never write them to `server/.env`.**

---

### Task 1: Schema — surrogate id, guest columns

**Files:**
- Modify: `server/src/schema.sql` (append)
- Test: `server/src/test/app.test.js` (new `describe("signups schema")`)
- Modify: `cleanup()` in `app.test.js`. Also run `DELETE FROM signups WHERE added_by=$1`, before the user's own signups are deleted.

**Interfaces:**
- Produces:
  - `signups.id BIGSERIAL PRIMARY KEY`
  - `signups.user_id` nullable
  - `signups.guest_name TEXT`
  - `signups.added_by UUID REFERENCES users(id)`
  - CHECK constraint `signups_member_or_guest`
  - unique index `signups_session_user_idx ON signups(session_id, user_id) WHERE user_id IS NOT NULL`

- [ ] **Step 1: Write failing tests** (through `directPool`):
  - `schema.sql applies twice without error`
  - `existing-style member insert without id gets an id`
  - `duplicate member signup for the same session raises 23505`
  - `guest row with user_id NULL, guest_name and added_by is accepted`
  - `row with both user_id and guest_name is rejected by the CHECK`
- [ ] **Step 2: Run** `npm test` on the guests-test branch. Expected: the new tests FAIL.
- [ ] **Step 3: Append the migration.**
  - `ADD COLUMN IF NOT EXISTS` for `id BIGSERIAL`, `guest_name` and `added_by`.
  - A `DO $$` block that, only while `signups_pkey` is on `(session_id, user_id)`, drops it and adds `PRIMARY KEY (id)`.
  - `ALTER COLUMN user_id DROP NOT NULL`.
  - A `DO $$`-guarded CHECK:
    ```sql
    (user_id IS NOT NULL AND guest_name IS NULL)
    OR (user_id IS NULL AND guest_name IS NOT NULL AND added_by IS NOT NULL)
    ```
  - `CREATE UNIQUE INDEX IF NOT EXISTS` for the partial index.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(server): signups surrogate id and guest columns`.
- [ ] **Step 6: Run the prod-data check (Review Focus 1).**
  - On the guests-test branch, which still holds the copy of prod made before the tests, count `signups` rows before and after `node src/migrate.js` ×2.
  - Expected: same count, no null `id`, and the 밴민턴 session from 2026-11-22 still shows 3 signups.

---

### Task 2: Guest signup and removal

**Files:**
- Modify: `server/src/lib/signupQueue.js`
- Modify: `server/src/routes/signups.js`
- Test: `server/src/test/app.test.js` (new `describe("guests")`)

**Interfaces:**
- Consumes: the Task 1 columns.
- Produces:
  - `promote(client, sessionId)` selects by `id` (no behaviour change).
  - `positionOf(db, sessionId, signupId) -> { status, position } | null`. Its parameter is now the signup row `id`; existing callers look the id up first.
  - `listSignups(db, sessionId, { viewerId, isOwner }) -> { registered, waitlist }`. Each row is `{ nickname, position, signedUpAt, isGuest, guestOf? , userId?, guestId? }`:
    - `nickname` is the guest name for guests.
    - `guestOf` is the host's member nickname for the group.
    - `userId` is included for the owner only.
    - `guestId` (the row id, as a string) is included when `isOwner` or `added_by === viewerId`.
  - `POST /signup` with `{ guestName }` inserts a guest row (`nickname = guest_name = name`, `added_by = caller`). Response: `{ status, position, guestId }`. Without `guestName` it behaves exactly as today.
  - `DELETE /groups/:g/sessions/:s/guests/:guestId`:
    - host or owner only (anyone else → 403); 404 if there's no such guest in this session
    - for the host, a registered guest on a locked day → 403 with the lock copy
    - decrements and promotes if the guest was registered
    - returns `{ removed: true, promoted }`

- [ ] **Step 1: Write failing tests:**
  - `member registers a guest → { status: "registered", position: 2 }, list shows "guest of"`
  - `guest goes to waitlist when full, and is promoted after add-court`
  - `same host, two guests named "Min" → two rows, removing one by guestId leaves the other`
  - `host unregistering themselves leaves their guest registered`
  - `host cannot remove a registered guest on the session day → 403 lock copy`
  - `host can remove a waitlisted guest on the session day`
  - `owner removes a guest on the session day → promoted 1`
  - `another member cannot remove someone else's guest → 403`
  - `guestId hidden from other members in GET /signups`
  - `guest name "" or 41 chars → 400`
  - `signed_up_count equals registered rows (members + guests)`
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** In every queue query, replace `user_id`-keyed row selection with `id`. Join `members` on `(group_id, added_by)` for `guestOf`.
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(server): register and remove guests`.

---

### Task 3: Leave/kick with guests; session list `myGuests`

**Files:**
- Modify: `server/src/lib/signupQueue.js` (`removeUserSignupsInGroup`)
- Modify: `server/src/routes/members.js` (leave lock check)
- Modify: `server/src/routes/sessions.js` (`signupInfo`, `toItem`)
- Test: `server/src/test/app.test.js`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `removeUserSignupsInGroup` also deletes rows `WHERE added_by = userId`, for sessions with `date >= today`, then decrements and promotes per registered row.
  - Leave is refused (403, existing copy) if the user **or a registered guest they added** is in a locked, not-ended, not-cancelled session.
  - The session item gains `myGuests: [{ guestId, name, status, position }]`, ordered by `signed_up_at`.

- [ ] **Step 1: Write failing tests:**
  - `kick host → their future guest removed, waitlist promoted, past guest row kept`
  - `host with a registered guest in today's session cannot leave → 403`
  - `session item myGuests lists the caller's guests with status and position`
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(server): guests follow host on leave/kick; myGuests on sessions`.

---

### Task 4: Guest UI

**Files:**
- Modify: `src/api.js` (`signup(groupId, sessionId, token, guestName?)`, `removeGuest(groupId, sessionId, guestId, token)`)
- Modify: `src/hooks/useSessions.js` (`registerGuest(sessionId, name)` throws on error for the form; `removeGuest(sessionId, guestId)`)
- Create: `src/components/GuestModal.jsx` (name input, same modal styles as `EditSessionModal`)
- Modify: `src/components/SessionCard.jsx`, `src/components/SignupsList.jsx`, `src/pages/GroupPage.jsx`

**Behaviour:**
- **The button.** When signups are open (`canSignUp`), show the button **Register for a guest** next to the main button.
- **The form.** The modal title is `Register a guest`, with field label `Guest name` (`maxLength={40}`).
- **Toasts.** `{name} is registered — #N`, or `{name} is on the waitlist — #N`.
- **"Your guests" block on the card.** Lists each entry of `session.myGuests` as `{name} — #N` or `{name} — Waitlist #N`. Each entry gets one of:
  - a **Remove** button, with `confirm("Remove {name}?")`;
  - muted `Locked on session day`, when the guest is registered and `session.locked`.
- **SignupsList.** Guest rows render `{nickname} (guest of {guestOf})`. The owner's × works for guests via `guestId`, and for members via `userId`, using the existing confirm.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run** `npm run lint && npm run build`. Expected: both succeed.
- [ ] **Step 3: Commit** `feat(web): register and remove guests`.

---

### After Task 4

- Delete the Neon test branch: `neon branches delete guests-test`. **Ask the owner first**, because this is a deletion.
- Final whole-branch review, then hand the branch to the owner to push. This shell cannot push.
