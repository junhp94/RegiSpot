export default function SignupsList({ signups }) {
  return (
    <div className="signups">
      <div className="signupsHeader">
        <span className="signupsTitle">Registered ({signups.length})</span>
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
  );
}
