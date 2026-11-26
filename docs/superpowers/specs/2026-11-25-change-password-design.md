# Change password + admin reset — design

**Size:** small change.

## Intent
Members need a way to change their password. When someone forgets theirs, the admin resets it to a temporary password, sends it to them, and the member then changes it themselves. Email reset links are out of scope because the app sends no email and nothing verifies addresses.

## Goals
- A signed-in user can change their own password.
- The admin can reset any user's password from their own machine.

## Non-goals
- Emailed "forgot password" links.
- Signing out other devices when a password changes. Existing JWTs stay valid until they expire (7 days).
- An in-app reset button for admins or owners (option B). This can be revisited later.

## Approaches (for the forgotten-password case)
- **A. CLI script (chosen).** `npm run reset-password -- <email> <newPassword>` in `server/`, using `server/.env`'s DATABASE_URL. It adds no attack surface and needs no UI. The cost is that the admin needs a laptop.
- **B. Admin/owner button in the Members panel.** It would work from a phone, but it adds a powerful endpoint, and a compromised owner account could take over every member's account. Rejected for now.

## Design
**Server**
- `POST /auth/change-password` goes on `authRouter`, so it gets the existing rate limiter. It reads the Bearer token the same way as `/auth/me`.
  - Body: `{ currentPassword, newPassword }`.
  - 401 if there's no token or it's invalid. 400 if `newPassword` is not a string or is shorter than 8 characters. 401 `"Current password is incorrect"` on mismatch. 404 if the user row is gone.
  - On success: bcrypt-hash with cost 10, `UPDATE users SET password_hash`, return `{ ok: true }`. The current token keeps working.
- `server/src/scripts/resetPassword.js`, plus the npm script `reset-password`.
  - Args: email (or the admin username) and the new password. It enforces the 8-character minimum and matches on lower(email).
  - It prints success, or "no user with that email", and exits non-zero on failure.

**Frontend**
- `api.js`: add `changePassword(currentPassword, newPassword, token)`.
- `ChangePasswordModal.jsx`: fields for current password, new password, and confirm new password.
  - Client checks: all fields filled, at least 8 characters, new and confirm match.
  - Show the server error in `ERROR_BOX`. On success, close the modal and show a toast (or an inline success message).
- `AuthButton.jsx`: add a "Change password" button next to "Sign out" that opens the modal.

**Tests**
- Add integration tests in `server/src/test/app.test.js`:
  - success, after which the new password can log in and the old one can't
  - wrong current password → 401
  - new password too short → 400
  - no token → 401
- Run them against a Neon branch, not prod.

**Docs**
- Add the new route and the `reset-password` script to CLAUDE.md.

## Left to the builder
Exact modal styling (follow the existing modals), and toast vs. inline success message.
