export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const typeClass =
    toast.type === "success"
      ? "border-green-600/25 dark:border-green-400/30"
      : toast.type === "error"
        ? "border-red-500/25 dark:border-red-400/30"
        : "border-slate-900/10 dark:border-slate-400/15";

  return (
    <div
      className={`flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl my-3 border bg-white/72 dark:bg-slate-800/80 shadow-lg shadow-slate-900/10 dark:shadow-black/20 backdrop-blur-sm ${typeClass}`}
    >
      <span className="text-slate-900 dark:text-slate-100">{toast.text}</span>
      <button
        className="border-none bg-transparent cursor-pointer text-slate-900/65 dark:text-slate-400 text-sm"
        onClick={onClose}
      >
        ✕
      </button>
    </div>
  );
}
