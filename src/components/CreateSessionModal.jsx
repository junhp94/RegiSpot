import { useState } from "react";
import { MODAL_OVERLAY, MODAL_CARD, INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, ERROR_BOX } from "../lib/styles";
import { getSportConfig } from "../lib/sportConfig";

export default function CreateSessionModal({ onSubmit, onClose, sportType }) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState(20);
  const [sportFields, setSportFields] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const config = getSportConfig(sportType);
  const extraFields = config.sessionFields || [];

  function handleSportField(key, value) {
    setSportFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!date) { setError("Date is required."); return; }
    if (!time) { setError("Time is required."); return; }
    if (!location.trim()) { setError("Location is required."); return; }
    if (!capacity || capacity < 1) { setError("Capacity must be at least 1."); return; }
    setBusy(true);
    try {
      const params = { date, time, location: location.trim(), capacity: Number(capacity) };
      for (const field of extraFields) {
        const val = sportFields[field.key];
        if (val !== undefined && val !== "") {
          params[field.key] = field.type === "number" ? Number(val) : val;
        }
      }
      await onSubmit(params);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to create session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={MODAL_OVERLAY} onClick={onClose}>
      <div className={MODAL_CARD} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold m-0 mb-4 text-slate-900 dark:text-slate-100">
          Create Session
        </h3>

        {error && <div className={ERROR_BOX}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <label className={LABEL}>Date</label>
          <input
            className={INPUT}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <label className={LABEL}>Time</label>
          <input
            className={INPUT}
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />

          <label className={LABEL}>Location</label>
          <input
            className={INPUT}
            placeholder="e.g., Community Center Court 1"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />

          <label className={LABEL}>Capacity</label>
          <input
            className={INPUT}
            type="number"
            min="1"
            max="500"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />

          {extraFields.map((field) => (
            <div key={field.key}>
              <label className={LABEL}>{field.label}</label>
              {field.type === "select" ? (
                <select
                  className={INPUT}
                  value={sportFields[field.key] || ""}
                  onChange={(e) => handleSportField(field.key, e.target.value)}
                >
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className={INPUT}
                  type={field.type}
                  min={field.min}
                  max={field.max}
                  placeholder={field.placeholder}
                  value={sportFields[field.key] || ""}
                  onChange={(e) => handleSportField(field.key, e.target.value)}
                />
              )}
            </div>
          ))}

          <div className="flex justify-end gap-2.5 mt-5">
            <button type="button" className={BTN_GHOST} onClick={onClose}>Cancel</button>
            <button type="submit" className={BTN_PRIMARY} disabled={busy}>
              {busy ? "Creating..." : "Create Session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
