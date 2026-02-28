import SignupsList from "./SignupsList";
import { CARD, BTN_PRIMARY, BTN_GHOST, BTN_DANGER, PILL_OPEN, PILL_FULL } from "../lib/styles";
import { formatMatchFormat, formatSkillLevel } from "../lib/sportConfig";

function formatDateTime(s) {
  return `${s.date} · ${s.time}`;
}

const BADGE = "text-xs py-0.5 px-2 rounded-full font-medium";

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
  const spotsLeft = session.capacity - (session.signedUpCount ?? 0);
  const isFull = spotsLeft <= 0;

  const badges = [];
  if (session.matchFormat) {
    badges.push({ label: formatMatchFormat(session.matchFormat), color: "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300" });
  }
  if (session.skillLevel) {
    badges.push({ label: formatSkillLevel(session.skillLevel), color: "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300" });
  }
  if (session.courtCount) {
    badges.push({ label: `${session.courtCount} court${session.courtCount > 1 ? "s" : ""}`, color: "bg-teal-100 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300" });
  }

  return (
    <div className={`${CARD} transition-all duration-150 hover:shadow-xl hover:-translate-y-0.5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-bold tracking-tight text-[15px] text-slate-900 dark:text-slate-100">
            {formatDateTime(session)}
          </div>
          <div className="mt-1 text-[13px] text-slate-900/65 dark:text-slate-400">
            {session.location}
          </div>
        </div>

        <div className={isFull ? PILL_FULL : PILL_OPEN}>
          {isFull ? "Full" : `${spotsLeft} left`}
        </div>
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {badges.map((b) => (
            <span key={b.label} className={`${BADGE} ${b.color}`}>
              {b.label}
            </span>
          ))}
        </div>
      )}

      <div className="h-px bg-slate-900/8 dark:bg-slate-400/10 my-3" />

      <div className="flex gap-2.5 flex-wrap">
        {session.isRegistered ? (
          <button
            className={BTN_DANGER}
            onClick={() => onUnregister(session.id)}
            title="Unregister from this session"
          >
            Unregister
          </button>
        ) : (
          <button
            className={`${BTN_PRIMARY} ${isFull ? "opacity-55 cursor-not-allowed" : ""}`}
            onClick={() => onRegister(session.id)}
            disabled={isFull}
            title={isFull ? "Session is full" : "Register"}
          >
            Register
          </button>
        )}

        <button className={BTN_GHOST} onClick={() => onToggle(session.id)}>
          {isOpen ? "Hide registered" : "Show registered"}
        </button>

        {isOwner && (
          <button
            className={BTN_DANGER}
            onClick={() => onDelete(session.id)}
            title="Delete session"
          >
            Delete
          </button>
        )}
      </div>

      {isOpen && <SignupsList signups={signups} />}
    </div>
  );
}
