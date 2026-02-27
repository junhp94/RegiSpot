import { useAuth } from "../auth/useAuth";

export default function AuthButton() {
  const { user, loading, logout, isAuthenticated } = useAuth();

  if (loading || !isAuthenticated) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] text-slate-900/65 dark:text-slate-400 max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap">
        {user.email}
      </span>
      <button
        className="h-9 px-4 rounded-[10px] border border-blue-600/25 dark:border-blue-400/30 bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-semibold text-[13px] cursor-pointer transition-all hover:bg-blue-600/18 dark:hover:bg-blue-500/30"
        onClick={logout}
      >
        Sign Out
      </button>
    </div>
  );
}
