import { useState } from "react";
import { MODAL_OVERLAY, MODAL_CARD, INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, ERROR_BOX } from "../lib/styles";

export default function JoinGroupModal({ onSubmit, onClose, initialAccessCode = "" }) {
  const [accessCode, setAccessCode] = useState(initialAccessCode);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!accessCode.trim() || accessCode.trim().length !== 6) {
      setError("Enter a valid 6-digit access code.");
      return;
    }
    if (!nickname.trim()) {
      setError("Nickname is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ accessCode: accessCode.trim(), nickname: nickname.trim() });
      onClose();
    } catch (err) {
      setError(err.message || "Failed to join group.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_CARD} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold m-0 mb-4 text-slate-900 dark:text-slate-100">
          Join a Group
        </h3>

        {error && <div className={ERROR_BOX}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className={LABEL}>Access Code</label>
          <input
            className={INPUT}
            placeholder="6-digit code"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            maxLength={6}
          />

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
              {busy ? "Joining..." : "Join Group"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
