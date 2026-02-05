export default function TopBar({ groupId, setGroupId, name, setName }) {
  return (
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
  );
}
