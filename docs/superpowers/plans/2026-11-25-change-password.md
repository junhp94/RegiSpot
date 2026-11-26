# Change Password + Admin Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in users can change their own password. The admin can reset any user's password with a CLI command.

**Architecture:** `POST /auth/change-password` goes on the existing `authRouter`, so it gets the rate limiter and the same Bearer parsing as `/auth/me`. The reset logic lives in a small library function, so tests can call it directly and the CLI script stays a thin wrapper. On the frontend, a modal is opened from `AuthButton` in the top bar.

**Tech Stack:** Express, bcryptjs, pg, node:test (server). React, Tailwind classes from `src/lib/styles` (web).

**Spec:** `docs/superpowers/specs/2026-11-25-change-password-design.md`

## Global Constraints

- Minimum password length is **8** characters, the same as register. Passwords are never trimmed.
- bcrypt cost is **10**.
- Emails are matched with `lower(email) = lower($1)`, which also covers the admin username (no `@`).
- Changing a password does not invalidate existing JWTs.
- Work on the branch `feature/change-password`, created from `main`. Tests run against a **Neon branch**, never prod.

## Review Focus

1. A missing or non-string `currentPassword` must return 400, not a 500 from bcrypt. *(test in Task 1)*
2. A valid token whose user row was deleted must return 404, not a 500. *(test in Task 1)*
3. The reset script must match the email case-insensitively and must work for the admin username, which has no `@`. *(tests in Task 2)*
4. The reset script must refuse a password shorter than 8 characters and leave the hash unchanged. *(test in Task 2)*
5. Double-clicking Save in the modal must send only one request. The button is disabled while `busy`. *(manual check in Task 3)*

---

### Task 1: `POST /auth/change-password`

**Files:**
- Modify: `server/src/routes/auth.js`. Add the route after `/me`. Pull the Bearer parsing shared with `/me` into a local `tokenPayload(req)` helper that returns the payload or null.
- Test: `server/src/test/app.test.js`. Add `describe("change password")` after `describe("auth")`, using the existing `api()` and `cleanup()` helpers.

**Interfaces:**
- Produces: `POST /auth/change-password`, body `{ currentPassword: string, newPassword: string }`, with the Bearer token required.
  - `200 { ok: true }` on success
  - `401 { error: "Authentication required" | "Invalid or expired token" }` for a missing or bad token
  - `400 { error: "Current password is required" }` if `currentPassword` is not a non-empty string
  - `400 { error: "Password must be at least 8 characters" }` for a short or non-string `newPassword`
  - `401 { error: "Current password is incorrect" }` when the current password doesn't match
  - `404 { error: "User not found" }` when the user row is gone

- [ ] **Step 1: Write the failing tests.** Register `cp-<Date.now()>@test.com` with password `oldpass123`, then:
  - `it("changes password; new works, old fails")`: POST `{currentPassword:"oldpass123", newPassword:"newpass456"}` → 200 and `body.ok === true`. Login with `newpass456` → 200. Login with `oldpass123` → 401.
  - `it("wrong current password → 401")` → 401, error `"Current password is incorrect"`.
  - `it("short new password → 400")` with `newPassword:"short"` → 400.
  - `it("missing currentPassword → 400")` with body `{newPassword:"whatever99"}` → 400.
  - `it("no token → 401")`.
  - `it("deleted user → 404")`: register a second user, delete its row via `directPool`, then POST with its token → 404.
  - `after` → `cleanup([...emails])`.
- [ ] **Step 2: Run** `cd server && npm test`. The new tests should fail with 404 (route missing), and the existing tests should pass.
- [ ] **Step 3: Implement the route.** Validate the input before any DB or bcrypt call. Run `SELECT password_hash FROM users WHERE id=$1`, compare with `bcrypt.compare`, hash the new password with `bcrypt.hash(newPassword, 10)`, then `UPDATE users SET password_hash=$1 WHERE id=$2`. Wrap it in try/catch → 500 `"Server error"`, like the other routes.
- [ ] **Step 4: Run** `npm test`. Everything should pass.
- [ ] **Step 5: Commit** (include the spec and this plan):
  ```bash
  git add server/src/routes/auth.js server/src/test/app.test.js docs/superpowers
  git commit -m "feat(server): signed-in users can change their password"
  ```

### Task 2: Admin reset script

**Files:**
- Create: `server/src/lib/resetPassword.js`
- Create: `server/src/scripts/resetPassword.js`. Copy the dotenv loading and pool setup from `seedSchedules.js`.
- Modify: `server/package.json`. Add the script `"reset-password": "node src/scripts/resetPassword.js"`.
- Test: `server/src/test/app.test.js`. Add `describe("reset password script")`.

**Interfaces:**
- Produces: `export async function resetPassword(db, email, newPassword)`, where `db` has a pg-style `.query`.
  - Returns `{ email }` (the stored email) on success.
  - Throws `Error("Password must be at least 8 characters")` for a short password, and `Error("No user with that email")` when there's no match.
  - Hashes with bcrypt cost 10.
- CLI: `npm run reset-password -- <email> <newPassword>`. It prints `Password reset for <email>` and exits 0. On a thrown error, or when arguments are missing (print usage), it prints the message and sets `process.exitCode = 1`. It always calls `pool.end()`.

- [ ] **Step 1: Write the failing tests.** Import `resetPassword` dynamically after dotenv, like `app.js`. Register `rp-<ts>@test.com` with `oldpass123`.
  - `it("resets password, case-insensitive email")`: `resetPassword(directPool, "RP-<ts>@TEST.COM", "temp12345")`, then login with `temp12345` → 200.
  - `it("works for an identifier without @")`: insert a user directly via `directPool` with email `rpadmin<ts>`, name `Admin`, and any password hash. Reset it, then login with `{email:"rpadmin<ts>", password:<new>}` → 200. Clean up this user too.
  - `it("short password rejected, hash unchanged")`: `assert.rejects(..., /at least 8/)`, then the old password still logs in.
  - `it("unknown email rejected")`: `assert.rejects(..., /No user/)`.
- [ ] **Step 2: Run** `npm test`. Expect failures because the module can't be found.
- [ ] **Step 3: Implement** `lib/resetPassword.js` and the CLI wrapper, and add the npm script.
- [ ] **Step 4: Run** `npm test` until everything passes. Then smoke-test the CLI against a Neon branch: `npm run reset-password -- nobody@x.com longenough1` should print `No user with that email` and exit 1, and running it with no args should print usage.
- [ ] **Step 5: Commit**
  ```bash
  git add server/src/lib/resetPassword.js server/src/scripts/resetPassword.js server/package.json server/src/test/app.test.js
  git commit -m "feat(server): admin CLI to reset a user's password"
  ```

### Task 3: Change-password UI + docs

**Files:**
- Modify: `src/api.js`. Add an `// Auth` section.
- Create: `src/components/ChangePasswordModal.jsx`. Follow `JoinGroupModal.jsx` and use `MODAL_OVERLAY, MODAL_CARD, INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, ERROR_BOX`.
- Modify: `src/components/AuthButton.jsx`
- Modify: `CLAUDE.md`. Add `POST /auth/change-password` to the routes list, and `npm run reset-password -- <email> <newPassword>` to the backend commands.

**Interfaces:**
- Consumes: the Task 1 endpoint.
- Produces: `export async function changePassword(currentPassword, newPassword, accessToken)`, which POSTs to `/auth/change-password` and returns `readJson(res, {})`. It throws with the server's error message.
- `ChangePasswordModal({ onClose })` gets `accessToken` from `useAuth()`.

- [ ] **Step 1: Build the modal.**
  - Fields: "Current password" (`autoComplete="current-password"`), "New password", and "Confirm new password" (both `autoComplete="new-password"`), all `type="password"`.
  - Client errors, checked in this order:
    - `"All fields are required."`
    - `"New password must be at least 8 characters."`
    - `"New passwords don't match."`
  - The submit button reads "Save" and shows "Saving..." while `busy`, and it is disabled while busy.
  - On success, replace the form with "Password changed." and a "Done" button that calls `onClose`. This is the inline success choice, so `TopBar` needs no toast wiring.
  - Server errors show in `ERROR_BOX`.
- [ ] **Step 2: Add the button.** In `AuthButton`, add a "Change password" button before "Sign out", with the same classes. It toggles `showModal`, and the button renders `<ChangePasswordModal onClose=... />` when the modal is open.
- [ ] **Step 3: Run** `npm run lint` and `npm run build` from the project root. Both should finish with no errors.
- [ ] **Step 4: Check it by hand.** Run `npm run dev` with the server pointed at a Neon branch.
  - A wrong current password shows "Current password is incorrect".
  - A mismatched confirm shows the client error.
  - Double-clicking Save sends one request (check the Network tab).
  - After a successful change, sign out and sign back in with the new password.
- [ ] **Step 5: Commit**
  ```bash
  git add src/api.js src/components/ChangePasswordModal.jsx src/components/AuthButton.jsx CLAUDE.md
  git commit -m "feat(web): change password from the top bar"
  ```
