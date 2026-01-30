import { useState } from 'react'
import './App.css'

const initSessions = [
  {
    id: "session-1",
    date: "Jan 30, 2026",
    time: "8:00 PM - 10:00 PM",
    location: "Belevedere Club",
    capacity: 20,
    signups: [],
  },
];

export default function App() {
  const [sessions, setSessions] = useState(initSessions);
  const [name, setName] = useState("");

  const signup = (sessionId) => {
    if (!name) return alert("Enter your name");

    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId && s.signups.length < s.capacity
          ? { ...s, signups: [...s.signups, name] }
          : s
      )
    );

    setName("");
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>🏸 Badminton Session Signup</h1>

      {sessions.map((s) => (
        <div key={s.id} style={{ marginTop: "1.5rem" }}>
          <h3>{s.date} ({s.time})</h3>
          <p>{s.location}</p>
          <p>Spots left: {s.capacity - s.signups.length}</p>

          <input
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button onClick={() => signup(s.id)}>Join</button>

          <ul>
            {s.signups.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}