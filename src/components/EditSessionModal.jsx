import { useState } from "react";
import { MODAL_OVERLAY, MODAL_CARD, INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, ERROR_BOX } from "../lib/styles";

// Owner: change one session's time or place (e.g. a week that already has players,
// which schedule edits deliberately leave alone).
export default function EditSessionModal({ session, onSubmit, onClose }) {
  const [time, setTime] = useState(session.time);
  const [endTime, setEndTime] = useState(session.endTime || "");
  const [location, setLocation] = useState(session.location);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!time) { setError("Start time is required."); return; }
    if (!location.trim()) { setError("Location is required."); return; }
    setBusy(true);
    try {
      await onSubmit({ time, endTime: endTime || null, location: location.trim() });
      onClose();
    } catch (err) {
      setError(err.message || "Couldn't save the session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_CARD} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold m-0 mb-2 text-fg">Edit session</h3>
        {error && <div className={ERROR_BOX}>{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL}>Start</label>
              <input className={INPUT} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div>
              <label className={LABEL}>End</label>
              <input className={INPUT} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
          <label className={LABEL}>Location</label>
          <input className={INPUT} value={location} onChange={(e) => setLocation(e.target.value)} />
          <div className="flex gap-2 justify-end mt-5">
            <button type="button" className={BTN_GHOST} onClick={onClose}>Cancel</button>
            <button type="submit" className={BTN_PRIMARY} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
