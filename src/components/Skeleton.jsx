const LINE_BASE = "rounded bg-subtle motion-safe:animate-pulse";

export function SkeletonLine({ width = "100%", className = "" }) {
  return <div className={`h-3.5 my-2.5 ${LINE_BASE} ${className}`} style={{ width }} />;
}

export function SkeletonCard() {
  return (
    <div className="p-4 rounded-md bg-surface border border-line">
      <SkeletonLine width="60%" />
      <SkeletonLine width="35%" />
    </div>
  );
}

export function SkeletonGrid({ count = 4 }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
