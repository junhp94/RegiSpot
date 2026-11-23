import { useAuth } from "../auth/useAuth";

export default function AuthButton() {
  const { user, loading, logout, isAuthenticated } = useAuth();

  if (loading || !isAuthenticated) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="hidden sm:inline text-sm text-muted max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">
        {user.email}
      </span>
      <button
        className="h-9 px-3 rounded-md border border-line-strong bg-surface text-fg text-sm font-bold cursor-pointer hover:bg-subtle"
        onClick={logout}
      >
        Sign out
      </button>
    </div>
  );
}
