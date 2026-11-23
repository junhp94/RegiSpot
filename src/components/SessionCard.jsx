import SignupsList from "./SignupsList";
import { CARD, BTN_PRIMARY, BTN_GHOST, BTN_DANGER } from "../lib/styles";
import { formatMatchFormat, formatSkillLevel } from "../lib/sportConfig";

// "2026-11-25" + "19:00" -> "Wed, Nov 25" and "7:00 PM"
function formatDate(date) {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(time) {
  const d = new Date(`1970-01-01T${time}`);
  if (Number.isNaN(d.getTime())) return time;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const NUDGE_AT = 3; // waitlisted players before suggesting another court

export default function SessionCard({
  session,
  isOpen,
  signups,
  isOwner,
  onRegister,
  onUnregister,
  onDelete,
  onToggle,
  onRemove,
  onAddCourt,
  onCancel,
}) {
  const taken = session.signedUpCount ?? 0;
  const waiting = session.waitlistCount ?? 0;
  const spotsLeft = session.capacity - taken;
  const isFull = spotsLeft <= 0;
  const status = session.myStatus;
  const isPast = session.ended;
  const isCancelled = session.cancelled;
  const canSignUp = session.visible && !isPast && !isCancelled;

  const details = [];
  if (session.matchFormat) details.push(formatMatchFormat(session.matchFormat));
  if (session.skillLevel) details.push(formatSkillLevel(session.skillLevel));
  if (session.courtCount) {
    details.push(`${session.courtCount} court${session.courtCount > 1 ? "s" : ""}`);
  }

  const timeLabel = session.endTime
    ? `${formatTime(session.time)}–${formatTime(session.endTime)}`
    : formatTime(session.time);

  return (
    <article
      className={`${CARD} ${status === "registered" ? "border-l-4 border-l-accent" : ""} ${isCancelled ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="m-0 text-lg font-bold text-fg">
            {formatDate(session.date)}, {timeLabel}
          </h3>
          <div className="mt-0.5 text-[15px] text-fg">{session.location}</div>
          {details.length > 0 && (
            <div className="mt-0.5 text-sm text-muted">{details.join(", ")}</div>
          )}
        </div>

        <div className="text-right shrink-0">
          {isCancelled ? (
            <div className="text-[15px] font-bold text-danger">Cancelled</div>
          ) : (
            <div className={`text-[15px] font-bold ${isFull ? "text-danger" : "text-fg"}`}>
              {isFull ? "Full" : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}
            </div>
          )}
          <div className="text-sm text-muted">
            {taken} of {session.capacity}
            {waiting > 0 && ` · ${waiting} waiting`}
          </div>
        </div>
      </div>

      {status === "registered" && (
        <div className="mt-2 text-sm font-bold text-accent-text">You're #{session.myPosition}</div>
      )}
      {status === "waitlisted" && (
        <div className="mt-2 text-sm font-bold text-fg">Waitlist #{session.myPosition}</div>
      )}

      {isOwner && canSignUp && waiting >= NUDGE_AT && (
        <div className="mt-3 flex items-center gap-3 flex-wrap px-3 py-2 rounded-md bg-subtle text-[15px] text-fg">
          <span>{waiting} waiting — add a court?</span>
          <button className={BTN_PRIMARY} onClick={() => onAddCourt(session.id)}>
            Add court
          </button>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center mt-4">
        {canSignUp && status === "registered" && (
          session.locked ? (
            <span className="text-sm text-muted">Locked on session day</span>
          ) : (
            <button className={BTN_GHOST} onClick={() => onUnregister(session.id)}>
              Unregister
            </button>
          )
        )}
        {canSignUp && status === "waitlisted" && (
          <button className={BTN_GHOST} onClick={() => onUnregister(session.id)}>
            Leave waitlist
          </button>
        )}
        {canSignUp && !status && (
          <button className={BTN_PRIMARY} onClick={() => onRegister(session.id)}>
            {isFull ? "Join waitlist" : "Register"}
          </button>
        )}

        <button className={BTN_GHOST} onClick={() => onToggle(session.id)} aria-expanded={isOpen}>
          {isOpen ? "Hide list" : "Who's going"}
        </button>

        {isOwner && !isPast && (
          <div className="flex gap-2 flex-wrap items-center ml-auto">
            {!isCancelled && waiting < NUDGE_AT && (
              <button className={BTN_GHOST} onClick={() => onAddCourt(session.id)}>
                Add court
              </button>
            )}
            {session.scheduleId ? (
              <button
                className={isCancelled ? BTN_GHOST : BTN_DANGER}
                onClick={() => onCancel(session.id, !isCancelled)}
              >
                {isCancelled ? "Restore" : "Cancel session"}
              </button>
            ) : (
              <button className={BTN_DANGER} onClick={() => onDelete(session.id)}>
                Delete session
              </button>
            )}
          </div>
        )}
      </div>

      {isOpen && (
        <SignupsList
          signups={signups}
          isOwner={isOwner && !isPast}
          onRemove={(userId) => onRemove(session.id, userId)}
        />
      )}
    </article>
  );
}
