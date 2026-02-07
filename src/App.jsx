import { useState } from "react";
import "./App.css";
import TopBar from "./components/TopBar";
import Toast from "./components/Toast";
import SessionCard from "./components/SessionCard";
import useSessions from "./hooks/useSessions";
function LoadingSkeleton() {
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


export default function App() {
  const [groupId, setGroupId] = useState("");

  const {
    sessions,
    name,
    setName,
    loading,
    openSessionId,
    signupsBySession,
    toast,
    setToast,
    signup,
    toggleSignups,
    clearToast,
  } = useSessions(groupId);

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="page">
      <div className="shell">
        <TopBar
          groupId={groupId}
          setGroupId={setGroupId}
          name={name}
          setName={setName}
          setToast={setToast}
        />

        <Toast toast={toast} onClose={clearToast} />
          
        <div className="grid">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isOpen={openSessionId === session.id}
              signups={signupsBySession[session.id] || []}
              onRegister={signup}
              onToggle={toggleSignups}
            />
          ))}
        </div>

        <div className="footer">
          <span>Serverless: API Gateway · Lambda · DynamoDB</span>
        </div>
      </div>
    </div>
  );
}
