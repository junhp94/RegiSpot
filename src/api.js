const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "http://localhost:3000";

async function readJson(res, fallback) {
  const data = await res.json().catch(() => fallback);
  if (!res.ok) throw new Error(data?.error || data?.message || "Request failed");
  return data;
}

function authHeaders(accessToken) {
  const headers = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  return headers;
}

// ============================================
// Groups
// ============================================

export async function getUserGroups(accessToken) {
  const res = await fetch(`${API_BASE}/users/me/groups`, {
    headers: authHeaders(accessToken),
  });
  return readJson(res, []);
}

export async function createGroup({ groupName, sportType, maxMembers, nickname }, accessToken) {
  const res = await fetch(`${API_BASE}/groups`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ groupName, sportType, maxMembers, nickname }),
  });
  return readJson(res, {});
}

export async function joinGroup({ accessCode, nickname }, accessToken) {
  const res = await fetch(`${API_BASE}/groups/join`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ accessCode, nickname }),
  });
  return readJson(res, {});
}

export async function getGroup(groupId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}`,
    { headers: authHeaders(accessToken) }
  );
  return readJson(res, {});
}

// ============================================
// Sessions
// ============================================

// view: "upcoming" | "scheduled" | "past" (owner only; members always get upcoming)
export async function getSessions(groupId, accessToken, view) {
  if (!groupId?.trim()) return [];
  const query = view ? `?view=${encodeURIComponent(view)}` : "";
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions${query}`,
    { headers: authHeaders(accessToken) }
  );
  return readJson(res, []);
}

export async function createSession(groupId, { date, time, endTime, location, capacity, matchFormat, skillLevel, courtCount }, accessToken) {
  const body = { date, time, location, capacity };
  if (endTime) body.endTime = endTime;
  if (matchFormat) body.matchFormat = matchFormat;
  if (skillLevel) body.skillLevel = skillLevel;
  if (courtCount) body.courtCount = courtCount;

  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(body),
    }
  );
  return readJson(res, {});
}

export async function deleteSession(groupId, sessionId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    }
  );
  return readJson(res, {});
}

// ============================================
// Signups
// ============================================

export async function signup(groupId, sessionId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}/signup`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({}),
    }
  );
  return readJson(res, {});
}

export async function unregister(groupId, sessionId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}/signup`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    }
  );
  return readJson(res, {});
}

export async function getSignups(groupId, sessionId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}/signups`,
    { headers: authHeaders(accessToken) }
  );
  return readJson(res, []);
}

const sessionUrl = (groupId, sessionId) =>
  `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}`;

// Owner: edit or cancel a session — patch = { location?, time?, endTime?, cancelled? }
export async function updateSession(groupId, sessionId, patch, accessToken) {
  const res = await fetch(sessionUrl(groupId, sessionId), {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(patch),
  });
  return readJson(res, {});
}

// Owner: remove a player from a session (works on the session day too)
export async function removeSignup(groupId, sessionId, userId, accessToken) {
  const res = await fetch(`${sessionUrl(groupId, sessionId)}/signups/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  return readJson(res, {});
}

// Owner: +1 court, +6 spots; waitlist is promoted automatically
export async function addCourt(groupId, sessionId, accessToken) {
  const res = await fetch(`${sessionUrl(groupId, sessionId)}/add-court`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({}),
  });
  return readJson(res, {});
}

// ============================================
// Weekly schedules
// ============================================

const schedulesUrl = (groupId) => `${API_BASE}/groups/${encodeURIComponent(groupId)}/schedules`;

export async function getSchedules(groupId, accessToken) {
  const res = await fetch(schedulesUrl(groupId), { headers: authHeaders(accessToken) });
  return readJson(res, []);
}

// body = { weekday, startTime, endTime, location, courtCount, capacity, openDaysBefore? }
export async function createSchedule(groupId, body, accessToken) {
  const res = await fetch(schedulesUrl(groupId), {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(body),
  });
  return readJson(res, {});
}

// patch = any subset of the create fields, plus { active }
export async function updateSchedule(groupId, scheduleId, patch, accessToken) {
  const res = await fetch(`${schedulesUrl(groupId)}/${encodeURIComponent(scheduleId)}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(patch),
  });
  return readJson(res, {});
}

// ============================================
// Members
// ============================================

export async function getMembers(groupId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/members`,
    { headers: authHeaders(accessToken) }
  );
  return readJson(res, []);
}

export async function kickMember(groupId, userId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
    {
      method: "DELETE",
      headers: authHeaders(accessToken),
    }
  );
  return readJson(res, {});
}

export async function leaveGroup(groupId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/members/leave`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({}),
    }
  );
  return readJson(res, {});
}
