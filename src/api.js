// src/api.js
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// "Database" in memory (resets on refresh)
let sessions = [
  {
    id: "session-1",
    date: "Jan 30, 2026",
    time: "8:00 PM - 10:00 PM",
    location: "Belvedere Club",
    capacity: 20,
    signups: [],
  },
];

export async function getSessions() {
  await delay(150);
  return structuredClone(sessions);
}

export async function signup(sessionId, name) {
  await delay(150);

  const cleanName = name.trim();
  if (!cleanName) throw new Error("Name is required");

  sessions = sessions.map((s) => {
    if (s.id !== sessionId) return s;

    if (s.signups.length >= s.capacity) throw new Error("Session is full");

    // prevent duplicates (case-insensitive)
    const exists = s.signups.some(
      (n) => n.toLowerCase() === cleanName.toLowerCase()
    );
    if (exists) throw new Error("You are already signed up");

    return { ...s, signups: [...s.signups, cleanName] };
  });

  return { success: true };
}
