import { BTN_PRIMARY } from "../lib/styles";

// `icon` is accepted for backwards compatibility but no longer rendered.
// eslint-disable-next-line no-unused-vars
export default function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="py-10 px-6 border border-dashed border-line-strong rounded-md">
      {title && <h3 className="text-lg font-bold text-fg m-0 mb-1">{title}</h3>}
      {description && <p className="text-base text-muted m-0 mb-4">{description}</p>}
      {actionLabel && onAction && (
        <button className={BTN_PRIMARY} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
