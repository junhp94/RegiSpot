export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  const typeClass =
    toast.type === "success"
      ? "border-success"
      : toast.type === "error"
        ? "border-danger"
        : "border-line-strong";

  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-md mb-4 border border-l-4 bg-surface ${typeClass}`}
    >
      <span className="text-fg">{toast.text}</span>
      <button
        className="border-none bg-transparent cursor-pointer text-muted text-sm font-bold hover:text-fg"
        onClick={onClose}
        aria-label="Dismiss"
      >
        Close
      </button>
    </div>
  );
}
