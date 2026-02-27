export default function SignupsList({ signups }) {
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[13px] text-slate-900/80 dark:text-slate-300 font-bold">
          Registered ({signups.length})
        </span>
      </div>

      {signups.length === 0 ? (
        <div className="text-[13px] text-slate-900/65 dark:text-slate-400 py-2">
          No one yet.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {signups.map((x, i) => (
            <div
              className="inline-flex items-center gap-2 py-2 px-2.5 rounded-full border border-slate-900/10 dark:border-slate-400/15 bg-white/70 dark:bg-slate-700/50"
              key={`${x.name}-${i}`}
            >
              <span className="w-[22px] h-[22px] rounded-full grid place-items-center text-xs font-extrabold text-blue-600 dark:text-blue-400 bg-blue-600/12 dark:bg-blue-500/20 border border-blue-600/18 dark:border-blue-400/25">
                {(x.name || "?").trim().slice(0, 1).toUpperCase()}
              </span>
              <span className="text-[13px] font-semibold text-slate-900/82 dark:text-slate-200">
                {x.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
