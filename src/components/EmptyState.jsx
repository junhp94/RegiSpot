import { BTN_PRIMARY } from "../lib/styles";

export default function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      {title && (
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-1">
          {title}
        </h3>
      )}
      {description && (
        <p className="text-[15px] text-slate-900/65 dark:text-slate-400 m-0 mb-4">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button className={BTN_PRIMARY} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
