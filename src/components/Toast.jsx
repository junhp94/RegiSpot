export default function Toast({ toast, onClose }) {
  if (!toast) return null;

  return (
    <div className={`toast ${toast.type}`}>
      <span>{toast.text}</span>
      <button className="toastClose" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
