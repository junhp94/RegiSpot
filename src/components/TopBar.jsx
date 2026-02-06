import AuthButton from "./AuthButton";
import GroupPanel from "./GroupPanel";

export default function TopBar({ groupId, setGroupId, name, setName, setToast }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div className="logo">🏸</div>
        <div>
          <div className="title">RegiSpot</div>
          <div className="subtitle">Register for a badminton session</div>
        </div>
      </div>

      <div className="auth-container">
        <AuthButton />
      </div>

      <div className="nameBox">
          <GroupPanel
            groupId={groupId}
            setGroupId={setGroupId}
            setToast={setToast}
          />

          {groupId && (
            <>
              <div style={{ marginTop: 10 }} />
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
            </>
          )}
      </div>
    </div>
  );
}
