# Guest registration

Date: 2026-11-23 · Status: draft, awaiting owner approval
Builds on: `2026-11-23-waitlist-and-recurring-sessions-design.md`

## Intent

Members sometimes bring a friend who isn't in the club. A member taps **Register for a guest**
on a session and types the guest's name, and the guest takes a spot under exactly the same
rules as a member.

## Goals

- **Adding a guest.** "Register for a guest" opens a name field.
  - The guest is registered if a spot is free. Otherwise they join the waitlist, numbered like
    everyone else, and are promoted automatically (including after Add court).
- **How guests appear.** In the lists a guest shows as `#8 Minji (guest of Jun)`.
- **Who can remove a guest.**
  - The member who added them can remove them. The day-of lock applies: a *registered* guest
    can't be removed by the host on the session day. A waitlisted guest can be removed at any time.
  - The owner can remove a guest at any time, like any player.
- **Limits.** None on the number of guests per member, and the host doesn't need to be registered
  themselves.
- **Host leaves or is removed from the group.** Their guests in sessions from today onward are
  removed, and freed spots are promoted. Past history is kept.
  - Leaving the group is refused on a session day where the member or any of their registered
    guests is locked in (same rule as for members).

## Non-goals / anti-goals

- Guests have **no account, no login and no access**. A guest is only a name on a session.
- No guest list across sessions, and no reusing guest names. Each guest entry is per session.
- A guest must never bypass the day-of lock through their host leaving the group.

## Approaches

- **A. Guests are signup rows without an account (chosen).** The same `signups` table gains
  `guest_name` + `added_by`, so all queue code (order, promotion, counts, lock) applies unchanged.
- **B. Separate guests table.** Rejected: ordering and promotion would have to merge two tables,
  which duplicates the most delicate code.
- **C. A hidden user account per guest.** Rejected: fake accounts and emails, and the owner asked
  that guests have no accounts.

## Design

### Schema (idempotent, in `schema.sql`)

- `signups`:
  - Add `id BIGSERIAL` and make it the primary key, replacing `(session_id, user_id)` via a
    guarded `DO $$ … $$` block.
  - Make `user_id` nullable.
  - Add `guest_name TEXT` and `added_by UUID REFERENCES users(id)`.
  - CHECK: a row is either a member (`user_id` set, `guest_name` null) or a guest (`user_id`
    null, `guest_name` and `added_by` set).
  - A unique index on `(session_id, user_id) WHERE user_id IS NOT NULL` keeps "one signup per
    member per session".
- **Ordering tiebreak:** `user_id` becomes `id`.

### API

- `POST /groups/:g/sessions/:s/signup` with body `{ guestName }` registers a guest instead of
  the caller. The name is trimmed, 1–40 characters.
  - Response: `{ status, position, guestId }`.
  - Same visibility, closed and member checks as before.
- `DELETE /groups/:g/sessions/:s/guests/:guestId` removes a guest.
  - Allowed for the host (lock applies when the guest is registered) or the owner (no lock).
  - Promotes when a registered spot frees.
- `GET …/signups` rows gain `isGuest`, `guestOf` (the host's nickname) and `guestId`. `guestId`
  is returned only to the owner and the host.
- Session list items gain `myGuests: [{ guestId, name, status, position }]`.

### UI

- **SessionCard**, when signups are open:
  - A **Register for a guest** button opens a small name form.
  - A "Your guests" line lists each guest as `Minji — #8` or `Minji — Waitlist #2`, with
    **Remove**, or "Locked on session day" when the guest is registered and locked.
- **SignupsList:** shows `Minji (guest of Jun)`. The owner's × button works on guests too.

## Left to the builder

- Exact copy for toasts and errors (e.g. "Minji is registered — #8").
- Whether the guest form is an inline field or a modal. It should match the existing modal style.
