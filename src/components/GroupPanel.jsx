import { useState } from "react";
import { createGroup } from "../api";
import { useAuth } from "../auth/useAuth";

export default function GroupPanel({ groupId, setGroupId, setToast }) {
  const { accessToken, isAuthenticated } = useAuth();

  // "select" | "join" | "create"
  const [mode, setMode] = useState("select");

  const [inputGroupId, setInputGroupId] = useState("");
  const [inputGroupName, setInputGroupName] = useState("");
  const [inputNewPassword, setInputNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // If a group is already active, show active display
  if (groupId) {
    return (
      <div className="group-active">
        <span className="group-active-label">
          Group: <strong>{groupId}</strong>
        </span>
        <button
          className="btn btn-back"
          onClick={() => {
            setGroupId("");
            setMode("select");
          }}
        >
          Change
        </button>
      </div>
    );
  }

  function handleBack() {
    setMode("select");
    setInputGroupId("");
    setInputGroupName("");
    setInputNewPassword("");
  }

  async function handleJoin(e) {
    e.preventDefault();
    const id = inputGroupId.trim();
    if (!id) {
      setToast({ type: "error", text: "Enter a Group ID." });
      return;
    }
    setGroupId(id);
  }

  async function handleCreate(e) {
    e.preventDefault();
    const gn = inputGroupName.trim();
    const pw = inputNewPassword.trim();
    if (!gn) {
      setToast({ type: "error", text: "Group name is required." });
      return;
    }
    if (pw.length < 6) {
      setToast({ type: "error", text: "Password must be at least 6 characters." });
      return;
    }
    setBusy(true);
    try {
      const data = await createGroup(gn, pw, accessToken);
      setGroupId(data.groupId);
      setToast({ type: "success", text: `Group created! ID: ${data.groupId}` });
    } catch (err) {
      setToast({ type: "error", text: err.message || "Failed to create group." });
    } finally {
      setBusy(false);
    }
  }

  // Mode selector
  if (mode === "select") {
    return (
      <div className="group-panel">
        <label className="label">Get started</label>
        <div className="group-mode-buttons">
          <button className="btn primary" onClick={() => setMode("create")}>
            Create a Session Group
          </button>
          <button className="btn primary" onClick={() => setMode("join")}>
            Join a Session Group
          </button>
        </div>
      </div>
    );
  }

  // Join mode
  if (mode === "join") {
    return (
      <div className="group-panel">
        <button className="btn btn-back" onClick={handleBack}>Back</button>
        <form onSubmit={handleJoin} style={{ marginTop: 8 }}>
          <label className="label">Group ID</label>
          <div className="nameRow">
            <input
              className="input"
              placeholder="e.g., abc123"
              value={inputGroupId}
              onChange={(e) => setInputGroupId(e.target.value)}
            />
            <button type="submit" className="btn primary">Join</button>
          </div>
        </form>
      </div>
    );
  }

  // Create mode
  return (
    <div className="group-panel">
      <button className="btn btn-back" onClick={handleBack}>Back</button>
      <form onSubmit={handleCreate} style={{ marginTop: 8 }}>
        <label className="label">Group Name</label>
        <div className="nameRow" style={{ marginBottom: 8 }}>
          <input
            className="input"
            placeholder="e.g., Tuesday Badminton"
            value={inputGroupName}
            onChange={(e) => setInputGroupName(e.target.value)}
          />
        </div>
        <label className="label">Group Password</label>
        <div className="nameRow">
          <input
            className="input"
            type="password"
            placeholder="Min 6 characters"
            value={inputNewPassword}
            onChange={(e) => setInputNewPassword(e.target.value)}
          />
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? "Creating..." : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}
