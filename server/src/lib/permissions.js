/**
 * App-wide permission flags.
 *
 * GROUP_CREATORS (env, optional): comma-separated emails allowed to create groups.
 *   - Unset or empty → everyone can create groups (the normal, full feature).
 *   - Set           → only those emails can; everyone else can still join via
 *                     invite link / access code and register for sessions.
 * Used for the current single-group phase (Vanminton) without removing the
 * feature — clear the env var on Render to turn it back on for everyone.
 */
export function adminUsername() {
  return (process.env.ADMIN_USERNAME || "").trim().toLowerCase();
}

export function canCreateGroups(email) {
  const e = String(email || "").toLowerCase();
  // The seeded admin account can always create groups
  if (adminUsername() && e === adminUsername()) return true;
  const raw = (process.env.GROUP_CREATORS || "").trim();
  if (!raw) return true;
  const allowed = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(e);
}
