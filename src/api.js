const API_BASE = "https://rvqmjke48k.execute-api.us-east-1.amazonaws.com/prod";

async function readJson(res, fallback) {
  const data = await res.json().catch(() => fallback);
  if (!res.ok) throw new Error(data?.error || "Request failed");
  return data;
}

export async function getSessions(groupId) {
  if (!groupId?.trim()) return [];
  const res = await fetch(`${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions`);
  return readJson(res, []);
}

export async function signup(groupId, sessionId, name) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}/signup`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
  return readJson(res, {});
}

export async function getSignups(groupId, sessionId) {
  const res = await fetch(
    `${API_BASE}/groups/${encodeURIComponent(groupId)}/sessions/${encodeURIComponent(sessionId)}/signups`
  );
  return readJson(res, []);
}
