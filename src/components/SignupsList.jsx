export default function SignupsList({ signups }) {
  // API returns { nickname, signedUpAt }
  const nameOf = (x) => x.nickname || x.name || "?";
  return (
    <div className="mt-4 pt-3 border-t border-line">
      <div className="text-sm font-bold text-fg mb-2">Registered ({signups.length})</div>

      {signups.length === 0 ? (
        <div className="text-sm text-muted">No one has registered yet.</div>
      ) : (
        <ol className="m-0 pl-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-[15px] text-fg">
          {signups.map((x, i) => (
            <li key={`${nameOf(x)}-${i}`}>{nameOf(x)}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
