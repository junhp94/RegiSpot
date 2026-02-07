const API_BASE =
  import.meta.env.VITE_API_BASE ||
  "https://rvqmjke48k.execute-api.us-east-1.amazonaws.com/prod";

const API_KEY = import.meta.env.VITE_API_KEY || "";

async function readJson(res, fallback) {
  const data = await res.json().catch(() => fallback);
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

function authHeaders(accessToken) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  if (API_KEY) {
    headers["X-Api-Key"] = API_KEY;
  }
  return headers;
}

export async function getSessions(groupId, accessToken) {
  if (!groupId?.trim()) return [];
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions`,
    {
      headers: authHeaders(accessToken),
    }
  );
  return readJson(res, []);
}

export async function signup(groupId, sessionId, name, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}/signup`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ name }),
    }
  );
  return readJson(res, {});
}

export async function getSignups(groupId, sessionId, accessToken) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}/signups`,
    {
      headers: authHeaders(accessToken),
    }
  );
  return readJson(res, []);
}

export async function createGroup(groupName, groupPassword, accessToken) {
  const res = await fetch(`${API_BASE}/groups`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ groupName, groupPassword }),
  });
  return readJson(res, {});
}
