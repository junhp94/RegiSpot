import { useEffect, useState } from "react";
import { getSchedules, createSchedule, updateSchedule } from "../api";
import { useAuth } from "../auth/useAuth";
import { CARD, INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, ERROR_BOX } from "../lib/styles";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(time) {
  const d = new Date(`1970-01-01T${time}`);
  if (Number.isNaN(d.getTime())) return time;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const EMPTY_FORM = {
  weekday: 2, startTime: "20:00", endTime: "22:00", location: "",
  courtCount: 2, capacity: 12, openDaysBefore: 5,
};

function ScheduleForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!form.location.trim()) { setError("Location is required."); return; }
    if (!form.startTime || !form.endTime) { setError("Start and end time are required."); return; }
    setBusy(true);
    try {
      await onSave({
        weekday: Number(form.weekday),
        startTime: form.startTime,
        endTime: form.endTime,
        location: form.location.trim(),
        courtCount: Number(form.courtCount),
        capacity: Number(form.capacity),
        openDaysBefore: Number(form.openDaysBefore),
      });
    } catch (err) {
      setError(err.message || "Couldn't save the schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={CARD}>
      {error && <div className={ERROR_BOX}>{error}</div>}
      <label className={`${LABEL} mt-0`}>Day</label>
      <select className={INPUT} value={form.weekday} onChange={(e) => set("weekday", e.target.value)}>
        {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </select>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Start</label>
          <input className={INPUT} type="time" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>End</label>
          <input className={INPUT} type="time" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
        </div>
      </div>

      <label className={LABEL}>Location</label>
      <input className={INPUT} value={form.location} placeholder="e.g., Belvedere club, Richmond, BC"
        onChange={(e) => set("location", e.target.value)} />

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={LABEL}>Courts</label>
          <input className={INPUT} type="number" min="1" max="20" value={form.courtCount}
            onChange={(e) => set("courtCount", e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>Spots</label>
          <input className={INPUT} type="number" min="1" max="500" value={form.capacity}
            onChange={(e) => set("capacity", e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>Opens (days before)</label>
          <input className={INPUT} type="number" min="1" max="14" value={form.openDaysBefore}
            onChange={(e) => set("openDaysBefore", e.target.value)} />
        </div>
      </div>

      <p className="text-sm text-muted mt-3 mb-0">
        Changes apply to upcoming weeks that nobody has signed up for yet.
      </p>
      <div className="flex gap-2 justify-end mt-4">
        <button type="button" className={BTN_GHOST} onClick={onCancel}>Cancel</button>
        <button type="submit" className={BTN_PRIMARY} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </form>
  );
}

export default function SchedulesPanel({ groupId }) {
  const { accessToken } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // schedule id, "new", or null

  async function reload() {
    try {
      setSchedules(await getSchedules(groupId, accessToken));
      setError("");
    } catch (e) {
      setError(e.message || "Couldn't load schedules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, accessToken]);

  async function save(body) {
    if (editing === "new") await createSchedule(groupId, body, accessToken);
    else await updateSchedule(groupId, editing, body, accessToken);
    setEditing(null);
    await reload();
  }

  async function toggleActive(s) {
    try {
      await updateSchedule(groupId, s.id, { active: !s.active }, accessToken);
      await reload();
    } catch (e) {
      setError(e.message || "Couldn't update the schedule.");
    }
  }

  if (loading) return <div className="text-muted text-[15px]">Loading schedules…</div>;

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[15px] text-muted">
        Sessions are created automatically for the next 4 weeks and open to members
        the set number of days before they start.
      </p>
      {error && <div className={ERROR_BOX}>{error}</div>}

      {schedules.map((s) =>
        editing === s.id ? (
          <ScheduleForm key={s.id} initial={s} onSave={save} onCancel={() => setEditing(null)} />
        ) : (
          <div key={s.id} className={`${CARD} ${s.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-lg font-bold text-fg">
                  {WEEKDAYS[s.weekday]} · {formatTime(s.startTime)}–{formatTime(s.endTime)}
                  {!s.active && <span className="ml-2 text-sm text-muted">Paused</span>}
                </div>
                <div className="text-[15px] text-fg">{s.location}</div>
                <div className="text-sm text-muted">
                  {s.courtCount} court{s.courtCount === 1 ? "" : "s"} · {s.capacity} spots · opens {s.openDaysBefore} days before
                </div>
              </div>
              <div className="flex gap-2">
                <button className={BTN_GHOST} onClick={() => setEditing(s.id)}>Edit</button>
                <button className={BTN_GHOST} onClick={() => toggleActive(s)}>
                  {s.active ? "Pause" : "Resume"}
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {editing === "new" ? (
        <ScheduleForm initial={EMPTY_FORM} onSave={save} onCancel={() => setEditing(null)} />
      ) : (
        <div>
          <button className={BTN_PRIMARY} onClick={() => setEditing("new")}>Add weekly schedule</button>
        </div>
      )}
    </div>
  );
}
