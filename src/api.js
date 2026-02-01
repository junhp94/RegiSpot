const API_BASE = "https://rvqmjke48k.execute-api.us-east-1.amazonaws.com/prod";

export async function getSessions() {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error("Failed to load sessions");
  return await res.json();
}

export async function signup(sessionId, name) {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/signup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Signup failed");
  return data;
}
