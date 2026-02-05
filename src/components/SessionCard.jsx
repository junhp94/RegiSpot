import SignupsList from "./SignupsList";

function formatDateTime(s) {
  return `${s.date} · ${s.time}`;
}

export default function SessionCard({
  session,
  isOpen,
  signups,
  onRegister,
  onToggle,
}) {
  const spotsLeft = session.capacity - (session.signedUpCount ?? 0);
  const isFull = spotsLeft <= 0;

  return (
    <div className="card">
      <div className="cardHeader">
        <div>
          <div className="cardTitle">{formatDateTime(session)}</div>
          <div className="cardMeta">{session.location}</div>
        </div>

        <div className={`pill ${isFull ? "full" : "open"}`}>
          {isFull ? "Full" : `${spotsLeft} left`}
        </div>
      </div>

      <div className="divider" />

      <div className="cardActions">
        <button
          className={`btn primary ${isFull ? "disabled" : ""}`}
          onClick={() => onRegister(session.id)}
          disabled={isFull}
          title={isFull ? "Session is full" : "Register"}
        >
          Register
        </button>

        <button className="btn ghost" onClick={() => onToggle(session.id)}>
          {isOpen ? "Hide registered" : "Show registered"}
        </button>
      </div>

      {isOpen && <SignupsList signups={signups} />}
    </div>
  );
}
