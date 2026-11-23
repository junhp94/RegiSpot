/**
 * Signup queue — shared by every route that changes who is in a session.
 *
 * Concurrency: callers BEGIN a transaction and call lockSession() first.
 * SELECT … FOR UPDATE serialises all writers on that session row, so the
 * capacity check, the insert/delete and promote() can't interleave.
 *
 * Ordering:
 *   registered → COALESCE(registered_at, signed_up_at)  (promotion time counts)
 *   waitlisted → signed_up_at                           (first come, first served)
 * signed_up_count counts registered rows only.
 */

// signed_up_at breaks ties between players promoted together (same now()).
export const REGISTERED_ORDER = "COALESCE(registered_at, signed_up_at), signed_up_at, id";
export const WAITLIST_ORDER = "signed_up_at, id";
// Position within a row's own list (registered or waitlisted), for window functions.
const POSITION_ORDER = `CASE WHEN status = 'registered' THEN COALESCE(registered_at, signed_up_at) ELSE signed_up_at END,
                signed_up_at, id`;

/** Lock and return the session row, or null if it isn't in this group. */
export async function lockSession(client, groupId, sessionId) {
  const r = await client.query(
    "SELECT * FROM sessions WHERE id = $1 AND group_id = $2 FOR UPDATE",
    [sessionId, groupId]
  );
  return r.rows[0] || null;
}

/** Move waitlisted players into open spots, earliest first. Returns how many moved. */
export async function promote(client, sessionId) {
  const r = await client.query(
    `WITH s AS (SELECT capacity - signed_up_count AS open FROM sessions WHERE id = $1),
     moved AS (
       UPDATE signups SET status = 'registered', registered_at = now()
       WHERE session_id = $1 AND id IN (
         SELECT id FROM signups
         WHERE session_id = $1 AND status = 'waitlisted'
         ORDER BY ${WAITLIST_ORDER}
         LIMIT GREATEST((SELECT open FROM s), 0)
       )
       RETURNING 1
     )
     UPDATE sessions SET signed_up_count = signed_up_count + (SELECT count(*) FROM moved)
     WHERE id = $1
     RETURNING (SELECT count(*)::int FROM moved) AS n`,
    [sessionId]
  );
  return r.rows[0]?.n ?? 0;
}

/** 1-based position of a signup row (member or guest) within its list. */
export async function positionOf(db, sessionId, signupId) {
  const r = await db.query(
    `SELECT status, position FROM (
       SELECT id, status,
              ROW_NUMBER() OVER (PARTITION BY status ORDER BY ${POSITION_ORDER})::int AS position
       FROM signups WHERE session_id = $1
     ) x WHERE id = $2`,
    [sessionId, signupId]
  );
  return r.rows[0] || null;
}

/**
 * Both numbered lists for a session. Guests show their name plus guestOf (host's nickname).
 * userId is included for the owner only; guestId for the owner and the guest's host.
 */
export async function listSignups(db, sessionId, { viewerId = null, isOwner = false } = {}) {
  const r = await db.query(
    `SELECT x.*, h.nickname AS host_nickname FROM (
       SELECT su.*, ROW_NUMBER() OVER (PARTITION BY status ORDER BY ${POSITION_ORDER})::int AS position
       FROM signups su WHERE session_id = $1
     ) x
     JOIN sessions s ON s.id = x.session_id
     LEFT JOIN members h ON h.group_id = s.group_id AND h.user_id = x.added_by
     ORDER BY x.status, x.position`,
    [sessionId]
  );
  const shape = (row) => {
    const isGuest = row.user_id === null;
    return {
      ...(isOwner && row.user_id && { userId: row.user_id }),
      ...(isGuest && (isOwner || row.added_by === viewerId) && { guestId: String(row.id) }),
      nickname: row.nickname,
      position: row.position,
      signedUpAt: row.signed_up_at,
      isGuest,
      ...(isGuest && { guestOf: row.host_nickname ?? null }),
    };
  };
  return {
    registered: r.rows.filter((x) => x.status === "registered").map(shape),
    waitlist: r.rows.filter((x) => x.status === "waitlisted").map(shape),
  };
}

/**
 * Remove a user's signups from every session in a group (leave / kick).
 * Decrements signed_up_count only for registered rows, then promotes.
 * Call inside a transaction.
 */
export async function removeUserSignupsInGroup(client, groupId, userId, today) {
  // Only today and later — past sessions keep their attendance history.
  // Lock affected sessions in a stable order before touching them.
  const locked = await client.query(
    `SELECT s.id FROM sessions s JOIN signups su ON su.session_id = s.id
     WHERE s.group_id = $1 AND su.user_id = $2 AND s.date >= $3
     ORDER BY s.id FOR UPDATE OF s`,
    [groupId, userId, today]
  );
  if (locked.rows.length === 0) return;
  const del = await client.query(
    `DELETE FROM signups WHERE user_id = $1 AND session_id = ANY($2) RETURNING session_id, status`,
    [userId, locked.rows.map((r) => r.id)]
  );
  for (const row of del.rows) {
    if (row.status !== "registered") continue;
    await client.query(
      "UPDATE sessions SET signed_up_count = GREATEST(signed_up_count - 1, 0) WHERE id = $1",
      [row.session_id]
    );
    await promote(client, row.session_id);
  }
}
