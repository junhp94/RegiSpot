# Edit nickname — design (short)

## Why
Vanminton wants members listed by their Korean names. Some members joined with
English nicknames, and nicknames can't be changed today (set once at join).

## Goals
- A member can change their own nickname.
- The group owner can change any member's nickname (so they can fix it without
  chasing people).
- New members are nudged to use their Korean name when joining.

## Non-goals
- Dropping nicknames in favour of account names (considered, rejected — see Approaches).
- Editing the account name (`users.name`).
- Forcing Korean script (no validation on script; the validator already accepts Hangul).

## Approaches
- **A. Self-edit + owner can edit anyone (chosen).** Solves the problem even if
  members don't act themselves.
- B. Self-edit only. Less work, but depends on every member doing it.
- C. Replace nicknames with account names. Needs account-name editing, changes
  everyone's displayed name at once, and loses per-group uniqueness. Doesn't
  solve the English-name problem any better than A.

## Design
**API:** `PATCH /groups/:groupId/members/:userId` with `{ nickname }`.
- Caller must be a member. Allowed if `userId` is the caller, or the caller's role is `owner`.
  Otherwise 403. Target not in group → 404.
- Same cleaning/validation as join: `sanitizeString(…, 30)` + `isValidNickname` → 400.
- Updates `members.nickname` and `nickname_lower` in a transaction. Unique
  violation (`23505`) → 409 "Nickname is already taken in this group".
  Changing only the case of your own name (e.g. `jun` → `Jun`) is allowed.
- Same transaction: updates `signups.nickname` for the target's own signups
  (`user_id = target`) in this group's sessions with `date >= vancouverToday()`.
  Past sessions keep the old name. Guest rows are untouched (their `guestOf`
  is already read live from `members`).
- Returns `{ userId, nickname }`.

**Web:**
- `src/api.js`: `updateNickname(groupId, userId, nickname, token)`.
- `MembersPanel`: an "Edit" button on your own row, and on every row for the owner.
  Clicking turns the name into an inline input with Save / Cancel; errors (409, 400)
  show inline. On save, the list updates; if it was your own row, the
  "You're signed in as …" line on the group page updates too (via a callback /
  group refetch).
- `JoinGroupModal`: label "Your nickname (Korean name / 한국 이름)", placeholder "e.g., 김민수".
  Same hint on the create-group form if it has a nickname field.

**Tests (server, against a Neon branch):** self rename; owner renames member;
member renaming someone else → 403; duplicate → 409; invalid → 400; upcoming
signup shows new name, past signup keeps old one; guest's `guestOf` shows new host name.

**Docs:** add the route to the API list in `CLAUDE.md`.

## Left to the builder
Exact button styling (reuse existing `lib/styles` classes); how the group page
refreshes after a self-rename.
