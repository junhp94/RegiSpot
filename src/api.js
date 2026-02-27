const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://rvqmjke48k.execute-api.us-east-1.amazonaws.com/prod";

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

export async function getSessions(groupId, accessToken) {
  if (!groupId?.trim()) return [];
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions`,
    { headers: authHeaders(accessToken) }
  );
  return readJson(res, []);
}

export async function createSession(groupId, { date, time, location, capacity, matchFormat, skillLevel, courtCount }, accessToken) {
  const body = { date, time, location, capacity };
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

export async function getSignups(groupId, sessionId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}/signups`,
    { headers: authHeaders(accessToken) }
  );
  return readJson(res, []);
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
