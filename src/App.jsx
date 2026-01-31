import { use, useEffect, useState } from 'react'
import './App.css'
import { getSessions, signup as apiSignup } from './api';


export default function App() {
  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  async function refreshSessions() {
    setLoading(true);
    const data = await getSessions();
    setSessions(data);
    setLoading(false);
  }
  useEffect(() => {
    refreshSessions();
  }, []);

  const signup = async (sessionId) => {
    try {
      await apiSignup(sessionId, name);
      setName("");
      await refreshSessions();
    } catch (e) {
      alert(e.message || "Signup failed" );
    }
  };

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;

  return (
    <div style={{ padding: "2rem" }}>
      <h1>🏸 Vanminton Session Signup</h1>

      {sessions.map((s) => {
        const spotsLeft = s.capacity - s.signups.length;
        const isFull = spotsLeft <= 0;

        return (
          <div key={s.id} style={{ marginTop: "1.5rem" }}>
            <h3>
              {s.date} ({s.time})
            </h3>
            <p>{s.location}</p>
            <p>Spots left: {spotsLeft}</p>

            <input
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <button
              onClick={() => signup(s.id)}
              disabled={isFull}
              style={{ marginLeft: "0.5rem" }}
            >
              {isFull ? "Full" : "Join"}
            </button>

            <ul>
              {s.signups.map((n, i) => (
                <li key={`${s.id}-${i}`}>{n}</li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}