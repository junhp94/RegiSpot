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

export default function SessionCard({
  session,
  isOpen,
  signups,
  isOwner,
  onRegister,
  onUnregister,
  onDelete,
  onToggle,
}) {
  const taken = session.signedUpCount ?? 0;
  const spotsLeft = session.capacity - taken;
  const isFull = spotsLeft <= 0;

  const details = [];
  if (session.matchFormat) details.push(formatMatchFormat(session.matchFormat));
  if (session.skillLevel) details.push(formatSkillLevel(session.skillLevel));
  if (session.courtCount) {
    details.push(`${session.courtCount} court${session.courtCount > 1 ? "s" : ""}`);
  }

  return (
    <article className={`${CARD} ${session.isRegistered ? "border-l-4 border-l-accent" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="m-0 text-lg font-bold text-fg">
            {formatDate(session.date)}, {formatTime(session.time)}
          </h3>
          <div className="mt-0.5 text-[15px] text-fg">{session.location}</div>
          {details.length > 0 && (
            <div className="mt-0.5 text-sm text-muted">{details.join(", ")}</div>
          )}
        </div>

        <div className="text-right shrink-0">
          <div className={`text-[15px] font-bold ${isFull ? "text-danger" : "text-fg"}`}>
            {isFull ? "Full" : `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}
          </div>
          <div className="text-sm text-muted">
            {taken} of {session.capacity}
          </div>
        </div>
      </div>

      {session.isRegistered && (
        <div className="mt-2 text-sm font-bold text-accent-text">You're registered</div>
      )}

      <div className="flex gap-2 flex-wrap items-center mt-4">
        {session.isRegistered ? (
          <button className={BTN_GHOST} onClick={() => onUnregister(session.id)}>
            Unregister
          </button>
        ) : (
          <button
            className={BTN_PRIMARY}
            onClick={() => onRegister(session.id)}
            disabled={isFull}
          >
            Register
          </button>
        )}

        <button className={BTN_GHOST} onClick={() => onToggle(session.id)} aria-expanded={isOpen}>
          {isOpen ? "Hide list" : "Who's going"}
        </button>

        {isOwner && (
          <button className={`${BTN_DANGER} ml-auto`} onClick={() => onDelete(session.id)}>
            Delete session
          </button>
        )}
      </div>

      {isOpen && <SignupsList signups={signups} />}
    </article>
  );
}
