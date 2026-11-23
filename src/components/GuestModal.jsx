import { useState } from "react";
import { MODAL_OVERLAY, MODAL_CARD, INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, ERROR_BOX } from "../lib/styles";

const MAX = 40;

// Member registers a guest (no account) for one session. onSubmit(name) throws on failure.
export default function GuestModal({ onSubmit, onClose }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const clean = name.trim();
    if (!clean) { setError("Enter your guest's name."); return; }
    setBusy(true);
    try {
      await onSubmit(clean);
      onClose();
    } catch (err) {
      setError(err.message || "Couldn't register your guest.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_CARD} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold m-0 mb-2 text-fg">Register a guest</h3>
        <p className="m-0 text-sm text-muted">
          They'll get a spot if one is free, otherwise they join the waitlist.
        </p>
        {error && <div className={`${ERROR_BOX} mt-3`}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <label className={LABEL}>Guest name</label>
          <input
            className={INPUT}
            value={name}
            maxLength={MAX}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2 justify-end mt-5">
            <button type="button" className={BTN_GHOST} onClick={onClose}>Cancel</button>
            <button type="submit" className={BTN_PRIMARY} disabled={busy}>
              {busy ? "Registering…" : "Register guest"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
