// signups = { registered: [...], waitlist: [...] }, each row { userId?, nickname, position }
// userId is only present for the owner, who gets a remove button per row.
function NumberedList({ rows, isOwner, onRemove }) {
  return (
    <ol className="m-0 p-0 list-none grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[15px] text-fg">
      {rows.map((x) => (
        <li key={x.userId ?? `${x.position}-${x.nickname}`} className="flex items-center gap-2 min-h-8">
          <span className="w-7 shrink-0 text-right tabular-nums font-bold text-muted">#{x.position}</span>
          <span className="truncate">{x.nickname}</span>
          {isOwner && x.userId && (
            <button
              className="ml-auto h-8 w-8 rounded-md border-0 bg-transparent text-muted cursor-pointer hover:bg-subtle hover:text-danger"
              aria-label={`Remove ${x.nickname}`}
              onClick={() => onRemove(x.userId)}
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function SignupsList({ signups, isOwner, onRemove }) {
  const registered = signups?.registered ?? [];
  const waitlist = signups?.waitlist ?? [];
  return (
    <div className="mt-4 pt-3 border-t border-line">
      <div className="text-sm font-bold text-fg mb-2">Registered ({registered.length})</div>
      {registered.length === 0 ? (
        <div className="text-sm text-muted">No one has registered yet.</div>
      ) : (
        <NumberedList rows={registered} isOwner={isOwner} onRemove={onRemove} />
      )}

      {waitlist.length > 0 && (
        <>
          <div className="text-sm font-bold text-fg mt-4 mb-2">Waitlist ({waitlist.length})</div>
          <NumberedList rows={waitlist} isOwner={isOwner} onRemove={onRemove} />
        </>
      )}
    </div>
  );
}
