import { useState } from "react";
import { changePassword } from "../api";
import { useAuth } from "../auth/useAuth";
import { MODAL_OVERLAY, MODAL_CARD, INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, ERROR_BOX } from "../lib/styles";

export default function ChangePasswordModal({ onClose }) {
  const { accessToken } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!current || !next || !confirm) {
      setError("All fields are required.");
      return;
    }
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next, accessToken);
      setDone(true);
    } catch (err) {
      setError(err.message || "Couldn't change password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_CARD} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold m-0 mb-2 text-fg">Change password</h3>

        {done ? (
          <>
            <p className="text-fg m-0 mt-2">Password changed.</p>
            <div className="flex justify-end mt-5">
              <button type="button" className={BTN_PRIMARY} onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            {error && <div className={ERROR_BOX}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <label className={LABEL}>Current password</label>
              <input
                className={INPUT}
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
              />

              <label className={LABEL}>New password</label>
              <input
                className={INPUT}
                type="password"
                placeholder="At least 8 characters"
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
              />

              <label className={LABEL}>Confirm new password</label>
              <input
                className={INPUT}
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />

              <div className="flex justify-end gap-2.5 mt-5">
                <button type="button" className={BTN_GHOST} onClick={onClose}>Cancel</button>
                <button type="submit" className={BTN_PRIMARY} disabled={busy}>
                  {busy ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
