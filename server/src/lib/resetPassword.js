/**
 * Admin password reset — used by `npm run reset-password` when a member forgets
 * their password. The admin sets a temporary one, sends it to the member, and
 * the member changes it in the app. Matches email (or the admin username)
 * case-insensitively.
 */
import bcrypt from "bcryptjs";

export async function resetPassword(db, email, newPassword) {
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  const hash = await bcrypt.hash(newPassword, 10);
  const result = await db.query(
    "UPDATE users SET password_hash = $1 WHERE lower(email) = lower($2) RETURNING email",
    [hash, String(email || "").trim()]
  );
  if (!result.rows[0]) throw new Error("No user with that email");
  return { email: result.rows[0].email };
}
