const LINE_BASE = "rounded-full bg-slate-900/8 dark:bg-slate-400/15 animate-pulse";

export function SkeletonLine({ width = "100%", className = "" }) {
  return <div className={`h-3 my-2.5 ${LINE_BASE} ${className}`} style={{ width }} />;
}

export function SkeletonCard() {
  return (
    <div className="p-4 rounded-2xl bg-white/72 dark:bg-slate-800/80 border border-slate-900/10 dark:border-slate-400/15 shadow-lg shadow-slate-900/10 dark:shadow-black/20 backdrop-blur-sm">
      <SkeletonLine width="70%" />
      <SkeletonLine width="40%" />
      <div className="h-px bg-slate-900/8 dark:bg-slate-400/10 my-3" />
      <SkeletonLine width="55%" />
    </div>
  );
}

export function SkeletonGrid({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
