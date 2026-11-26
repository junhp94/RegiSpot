/**
 * Admin password reset — used by `npm run reset-password` when a member forgets
 * their password. The admin sets a temporary one, sends it to the member, and
 * the member changes it in the app. Matches email case-insensitively.
 * Members only — the admin account is refused (see below).
 */
import bcrypt from "bcryptjs";

export async function resetPassword(db, email, newPassword) {
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  // Only the seeded admin username lacks an "@" (register requires one). Its hash
  // is reset from ADMIN_PASSWORD on every boot (migrate.js), so refuse it here.
  if (!String(email || "").includes("@")) {
    throw new Error("The admin password is set by ADMIN_PASSWORD on Render, not this script");
  }
  const hash = await bcrypt.hash(newPassword, 10);
  const result = await db.query(
    "UPDATE users SET password_hash = $1 WHERE lower(email) = lower($2) RETURNING email",
    [hash, String(email || "").trim()]
  );
  if (!result.rows[0]) throw new Error("No user with that email");
  return { email: result.rows[0].email };
}
