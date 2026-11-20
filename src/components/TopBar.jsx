import { Link } from "react-router-dom";
import AuthButton from "./AuthButton";
import Logo from "./Logo";
import { useThemeContext } from "../hooks/useThemeContext";

export default function TopBar() {
  const { resolved, toggle } = useThemeContext();

  return (
    <div className="flex items-end justify-between gap-4 mb-4 flex-wrap">
      <Link
        to="/dashboard"
        className="flex items-center gap-3 no-underline text-inherit"
      >
        <Logo />
        <div>
          <div className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-slate-100">
            RegiSpot
          </div>
          <div className="text-[13px] text-slate-900/65 dark:text-slate-400 mt-0.5">
            Group session registration
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-3 ml-auto mr-4">
        <button
          onClick={toggle}
          className="w-9 h-9 rounded-[10px] border border-slate-900/10 dark:border-slate-400/15 bg-white/55 dark:bg-slate-700/50 cursor-pointer flex items-center justify-center text-lg transition-all hover:bg-white/80 dark:hover:bg-slate-700/70"
          title={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {resolved === "dark" ? "☀️" : "🌙"}
        </button>
        <AuthButton />
      </div>
    </div>
  );
}
