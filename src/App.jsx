import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { getSessions, signup as apiSignup, getSignups } from "./api";

function formatDateTime(s) {
  return `${s.date} · ${s.time}`;
}

export default function App() {
  const [groupId, setGroupId] = useState("test");

  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);

  const [openSessionId, setOpenSessionId] = useState(null);
  const [signupsBySession, setSignupsBySession] = useState({});

  const [toast, setToast] = useState(null); // { type: "success"|"error", text: string }

  const nameTrimmed = useMemo(() => name.trim(), [name]);

  async function refreshSessions() {
    setLoading(true);
    const data = await getSessions(groupId);
    setSessions(data);
    setLoading(false);
  }

  useEffect(() => {
  if (!groupId.trim()) return;
  refreshSessions();
  setOpenSessionId(null);
  setSignupsBySession({});
}, [groupId]);

  // auto-hide toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const signup = async (sessionId) => {
    if (!groupId.trim()) {
      setToast({ type: "error", text: "Enter a Group ID first." });
      return;
    }

    if (!nameTrimmed) {
      setToast({ type: "error", text: "Please enter your name." });
      return;
    }

    try {
      await apiSignup(groupId,sessionId, nameTrimmed);
      setName("");
      await refreshSessions();

      if (openSessionId === sessionId) {
        const data = await getSignups(sessionId);
        setSignupsBySession((prev) => ({ ...prev, [sessionId]: data }));
      }

      setToast({ type: "success", text: "You’re registered!" });
    } catch (e) {
      setToast({ type: "error", text: e.message || "Signup failed." });
    }
  };

  const toggleSignups = async (sessionId) => {
    if (openSessionId === sessionId) {
      setOpenSessionId(null);
      return;
    }
    setOpenSessionId(sessionId);
    
    if (signupsBySession[sessionId]) return;

    try {
      const data = await getSignups(groupId, sessionId);
      setSignupsBySession((prev) => ({
        ...prev,
        [sessionId]: data,
      }));
    } catch (e) {
      setToast({ type: "error", text: e.message || "Failed to load signups." });
    }
  };

  if (loading) {
    return (
      <div className="page">
        <div className="shell">
          <div className="topbar">
            <div className="brand">
              <div className="logo">🏸</div>
              <div>
                <div className="title">RegiSpot</div>
                <div className="subtitle">Badminton session signup</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="shell">
        <div className="topbar">
          <div className="brand">
            <div className="logo">🏸</div>
            <div>
              <div className="title">RegiSpot</div>
              <div className="subtitle">Register for a badminton session</div>
            </div>
          </div>

          <div className="nameBox">
            <label className="label">Group ID</label>
            <div className="nameRow" style={{ marginBottom: "10px" }}>
              <input
                className="input"
                placeholder="e.g., test"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              />
              <span className="hint">Which club</span>
            </div>

            <label className="label">Your name</label>
            <div className="nameRow">
              <input
                className="input"
                placeholder="e.g., Jun"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <span className="hint">Used to register</span>
            </div>
          </div>
        </div>

        {toast && (
          <div className={`toast ${toast.type}`}>
            <span>{toast.text}</span>
            <button className="toastClose" onClick={() => setToast(null)}>
              ✕
            </button>
          </div>
        )}

        <div className="grid">
          {sessions.map((s) => {
            const spotsLeft = s.capacity - (s.signedUpCount ?? 0);
            const isFull = spotsLeft <= 0;
            const isOpen = openSessionId === s.id;
            const signups = signupsBySession[s.id] || [];

            return (
              <div className="card" key={s.id}>
                <div className="cardHeader">
                  <div>
                    <div className="cardTitle">{formatDateTime(s)}</div>
                    <div className="cardMeta">{s.location}</div>
                  </div>

                  <div className={`pill ${isFull ? "full" : "open"}`}>
                    {isFull ? "Full" : `${spotsLeft} left`}
                  </div>
                </div>

                <div className="divider" />

                <div className="cardActions">
                  <button
                    className={`btn primary ${isFull ? "disabled" : ""}`}
                    onClick={() => signup(s.id)}
                    disabled={isFull}
                    title={isFull ? "Session is full" : "Register"}
                  >
                    Register
                  </button>

                  <button
                    className="btn ghost"
                    onClick={() => toggleSignups(s.id)}
                  >
                    {isOpen ? "Hide registered" : "Show registered"}
                  </button>
                </div>

                {isOpen && (
                  <div className="signups">
                    <div className="signupsHeader">
                      <span className="signupsTitle">
                        Registered ({signups.length})
                      </span>
                    </div>

                    {signups.length === 0 ? (
                      <div className="empty">No one yet.</div>
                    ) : (
                      <div className="chips">
                        {signups.map((x, i) => (
                          <div className="chip" key={`${x.name}-${i}`}>
                            <span className="avatar">
                              {(x.name || "?").trim().slice(0, 1).toUpperCase()}
                            </span>
                            <span className="chipName">{x.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="footer">
          <span>Serverless: API Gateway · Lambda · DynamoDB</span>
        </div>
      </div>
    </div>
  );
}
