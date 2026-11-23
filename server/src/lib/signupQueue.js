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
export const REGISTERED_ORDER = "COALESCE(registered_at, signed_up_at), signed_up_at, user_id";
export const WAITLIST_ORDER = "signed_up_at, user_id";

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
       WHERE session_id = $1 AND user_id IN (
         SELECT user_id FROM signups
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

/** 1-based position of a user within their list (registered or waitlisted). */
export async function positionOf(db, sessionId, userId) {
  const r = await db.query(
    `SELECT status, position FROM (
       SELECT user_id, status,
              ROW_NUMBER() OVER (PARTITION BY status ORDER BY
                CASE WHEN status = 'registered' THEN COALESCE(registered_at, signed_up_at) ELSE signed_up_at END,
                signed_up_at, user_id)::int AS position
       FROM signups WHERE session_id = $1
     ) x WHERE user_id = $2`,
    [sessionId, userId]
  );
  return r.rows[0] || null;
}

/** Both numbered lists for a session. userId included only when includeIds. */
export async function listSignups(db, sessionId, { includeIds = false } = {}) {
  const shape = (rows) =>
    rows.map((row, i) => ({
      ...(includeIds && { userId: row.user_id }),
      nickname: row.nickname,
      position: i + 1,
      signedUpAt: row.signed_up_at,
    }));
  const reg = await db.query(
    `SELECT user_id, nickname, signed_up_at FROM signups
     WHERE session_id = $1 AND status = 'registered' ORDER BY ${REGISTERED_ORDER}`,
    [sessionId]
  );
  const wl = await db.query(
    `SELECT user_id, nickname, signed_up_at FROM signups
     WHERE session_id = $1 AND status = 'waitlisted' ORDER BY ${WAITLIST_ORDER}`,
    [sessionId]
  );
  return { registered: shape(reg.rows), waitlist: shape(wl.rows) };
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
