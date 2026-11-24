# Edit Nickname Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members change their own group nickname and let the group owner change anyone's, so members can switch to Korean names.

**Architecture:** One new Express route `PATCH /groups/:groupId/members/:targetUserId` in `server/src/routes/members.js` that updates `members` and the target's upcoming `signups` rows in one transaction. The web app gets an `updateNickname` API call, inline editing in `MembersPanel`, and a Korean-name hint on the join/create forms.

**Tech Stack:** Express + pg (Neon Postgres), node:test integration tests, React + Vite + Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-24-edit-nickname-design.md`

## Global Constraints

- Nickname cleaning/validation identical to join: `sanitizeString(nickname, 30)` then `isValidNickname` → 400 `"A valid nickname is required (1-30 characters)"`.
- Duplicate (case-insensitive, via `UNIQUE (group_id, nickname_lower)`, pg code `23505`) → 409 `"Nickname is already taken in this group"`.
- Only `owner` and `member` roles exist. Owner may rename anyone (including self); a member may rename only self.
- Signups updated: `user_id = target` AND session in this group AND `sessions.date >= vancouverToday(new Date())`. Past rows keep the old name. Guest rows untouched.
- Tests run against a Neon **branch**, never the production database.
- Join/create label copy: `Your nickname (Korean name / 한국 이름)`, placeholder `e.g., 김민수`.

## Review Focus

- Case-only change of your own name (`Nick0` → `NICK0`) must succeed (200), not 409 — Task 1 test.
- A name differing only in case from **another** member must be 409 — Task 1 test.
- Whitespace-only nickname (`"   "`) must be 400 — Task 1 test.
- A signup for **today's** session (date = today) must get the new name — Task 1 test uses `vanDate(0)`.
- Owner renaming themselves updates the "You're signed in as …" line — Task 2 manual check.

---

### Task 1: Server — PATCH nickname route

**Files:**
- Modify: `server/src/routes/members.js` (add route after `GET /`, before `POST /leave`; update header comment)
- Test: `server/src/test/app.test.js` (new `describe("edit nickname", …)` at end of file)
- Modify: `CLAUDE.md` (add `PATCH  /groups/:id/members/:userId` to API route list)

**Interfaces:**
- Produces: `PATCH /groups/:groupId/members/:targetUserId`, body `{ nickname: string }` → 200 `{ userId, nickname }` | 400 | 403 | 404 | 409 | 500.

- [ ] **Step 1: Write the failing tests**

Use `makeGroup("nick", 3)`, `makeSession`, `signupPath`, `signupsPath`, `vanDate`, `directPool`, `cleanup` (all exist in the file). `const rename = (uid, nickname, token) => api("PATCH", `/groups/${g.groupId}/members/${uid}`, { nickname }, token);`

```js
it("member renames self → 200, members list shows new name", async () => {
  const [A] = g.members;
  const r = await rename(A.id, "김민수", A.token);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { userId: A.id, nickname: "김민수" });
  const list = (await api("GET", `/groups/${g.groupId}/members`, null, A.token)).body;
  assert.equal(list.find((m) => m.userId === A.id).nickname, "김민수");
});
it("owner renames a member → 200", ...)          // owner renames members[1] to "이서연" → 200
it("owner renames self → 200", ...)              // owner.id → "박지훈" → 200
it("member renames someone else → 403", ...)     // members[1] renames members[2] → 403
it("unknown target → 404", ...)                  // owner renames "00000000-0000-0000-0000-000000000000" → 404
it("non-member caller → 403", ...)               // register fresh user, PATCH members[2] → 403
it("invalid nickname → 400", ...)                // "", "   ", "a".repeat(31), "bad<name>" each → 400
it("name taken by another member (any case) → 409", ...)
  // members[2] renames to members[1]'s current name upper-cased → 409, error matches /taken/i
it("case-only change of own name → 200", ...)     // members[2]: "Nick2" → "NICK2" → 200
it("upcoming signups show new name, past keep old", async () => {
  // today = makeSession(date: vanDate(0), time "23:30"), fut = vanDate(1), past = vanDate(-1)
  // members[2] signs up for today & fut via API; insert past row via directPool:
  //   INSERT INTO signups (session_id, user_id, nickname, status) VALUES ($1,$2,'OldName','registered')
  // rename members[2] → "최유나"
  // GET signupsPath(today) & (fut): registered nickname for members[2] === "최유나"
  // SELECT nickname FROM signups WHERE session_id=past AND user_id=members[2].id → "OldName"
});
it("guest's guestOf shows host's new name", ...)
  // members[0] adds guest { guestName: "Sena" } to fut; rename members[0] → "정하늘";
  // signups list: guest row guestOf === "정하늘"
```

If `today`'s session time puts it inside the day-of lock, signing up may be refused; pick a time that the existing waitlist tests use for "today is open" or skip `today` and assert with `vanDate(1)` plus a directPool-inserted row for `vanDate(0)`.

- [ ] **Step 2: Run tests to verify they fail**

Run (from `server/`, with `.env` pointing at a Neon branch): `npm test`
Expected: new `edit nickname` tests FAIL (404 from unknown route); all existing tests PASS.

- [ ] **Step 3: Implement the route in `server/src/routes/members.js`**

Order of checks: caller membership (403 `"You are not a member of this group"`) → permission (`targetUserId !== userId && role !== "owner"` → 403 `"You can only change your own nickname"`) → validate (400) → target exists (404 `"Member not found"`) → transaction: `UPDATE members SET nickname=$1, nickname_lower=$2 …`; `UPDATE signups su SET nickname=$1 FROM sessions s WHERE su.session_id=s.id AND s.group_id=$3 AND su.user_id=$4 AND s.date >= $5`; COMMIT. Catch `23505` → ROLLBACK + 409. Import `sanitizeString`, `isValidNickname` from `../lib/validators.js`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS (previous count + 11).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/members.js server/src/test/app.test.js CLAUDE.md
git commit -m "feat(server): members and owner can change nicknames"
```

### Task 2: Web — edit nickname UI and Korean-name hint

**Files:**
- Modify: `src/api.js` (add after `kickMember`)
- Modify: `src/components/MembersPanel.jsx`
- Modify: `src/pages/GroupPage.jsx:248` (pass `onRenamed`)
- Modify: `src/components/JoinGroupModal.jsx:52-55`, `src/components/CreateGroupModal.jsx:79-82` (label + placeholder)

**Interfaces:**
- Consumes: Task 1's `PATCH` route.
- Produces: `updateNickname(groupId: string, userId: string, nickname: string, accessToken: string) → Promise<{ userId, nickname }>` (throws `Error(message)` via `readJson` on non-2xx).
- `MembersPanel` new prop `onRenamed(userId: string, nickname: string)`.

- [ ] **Step 1: Add `updateNickname` to `src/api.js`**

Same shape as `kickMember`: `PATCH`, `authHeaders`, `body: JSON.stringify({ nickname })`, `readJson(res, {})`.

- [ ] **Step 2: Inline edit in `MembersPanel`**

State: `editingId`, `draft`, `editError`, `saving`. Show an **Edit** button (`BTN_GHOST` or the existing small-button style from `lib/styles`) when `isOwner || m.userId === user?.userId`. Editing row: `<input maxLength={30}>` prefilled with current nickname + Save / Cancel; Enter saves, Escape cancels. On save: `updateNickname(...)`, replace that member's `nickname` in `members`, call `onRenamed?.(userId, nickname)`, close editor. On error: show `e.message` in small red text under the input, keep editor open. Disable Save while `saving` or when `draft.trim()` is empty.

- [ ] **Step 3: Wire `onRenamed` in `GroupPage`**

`onRenamed={(uid, nickname) => { if (uid === user?.userId) setGroup((g) => ({ ...g, membership: { ...g.membership, nickname } })); }}` — get `user` from `useAuth()` if not already in scope.

- [ ] **Step 4: Korean-name hint on join/create forms**

Label `Your nickname (Korean name / 한국 이름)`, placeholder `e.g., 김민수` in both modals.

- [ ] **Step 5: Verify**

Run: `npm run lint && npm run build`
Expected: no lint errors; build succeeds.

Manual (dev server against Neon branch API): as a member, edit own name to Korean → list and "signed in as" update; try another member's existing name → inline "Nickname is already taken in this group"; as owner, Edit appears on every row and renaming works; as member, Edit appears only on own row.

- [ ] **Step 6: Commit**

```bash
git add src/api.js src/components/MembersPanel.jsx src/pages/GroupPage.jsx src/components/JoinGroupModal.jsx src/components/CreateGroupModal.jsx
git commit -m "feat(web): edit nicknames inline; ask for Korean name on join"
```
