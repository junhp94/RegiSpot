import { useState } from "react";
import { MODAL_OVERLAY, MODAL_CARD, INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, ERROR_BOX } from "../lib/styles";

const SPORT_TYPES = [
  { value: "badminton", label: "Badminton" },
  { value: "tennis", label: "Tennis" },
  { value: "basketball", label: "Basketball" },
  { value: "volleyball", label: "Volleyball" },
  { value: "soccer", label: "Soccer" },
  { value: "other", label: "Other" },
];

const MAX_MEMBER_OPTIONS = [50, 100, 200, 500];

export default function CreateGroupModal({ onSubmit, onClose }) {
  const [groupName, setGroupName] = useState("");
  const [sportType, setSportType] = useState("badminton");
  const [maxMembers, setMaxMembers] = useState(100);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!groupName.trim()) { setError("Group name is required."); return; }
    if (!nickname.trim()) { setError("Nickname is required."); return; }
    setBusy(true);
    try {
      await onSubmit({ groupName: groupName.trim(), sportType, maxMembers, nickname: nickname.trim() });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_CARD} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold m-0 mb-4 text-slate-900 dark:text-slate-100">
          Create a Group
        </h3>

        {error && <div className={ERROR_BOX}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className={LABEL}>Group Name</label>
          <input
            className={INPUT}
            placeholder="e.g., Tuesday Badminton"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
          />

          <label className={LABEL}>Sport Type</label>
          <select
            className={INPUT}
            value={sportType}
            onChange={(e) => setSportType(e.target.value)}
          >
            {SPORT_TYPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <label className={LABEL}>Max Members</label>
          <select
            className={INPUT}
            value={maxMembers}
            onChange={(e) => setMaxMembers(Number(e.target.value))}
          >
            {MAX_MEMBER_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <label className={LABEL}>Your Nickname</label>
          <input
            className={INPUT}
            placeholder="e.g., Jun"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />

          <div className="flex justify-end gap-2.5 mt-5">
            <button type="button" className={BTN_GHOST} onClick={onClose}>Cancel</button>
            <button type="submit" className={BTN_PRIMARY} disabled={busy}>
              {busy ? "Creating..." : "Create Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
