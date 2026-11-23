import { Link } from "react-router-dom";
import AuthButton from "./AuthButton";
import Logo from "./Logo";
import { useThemeContext } from "../hooks/useThemeContext";

export default function TopBar() {
  const { resolved, toggle } = useThemeContext();

  return (
    <header className="border-b border-line bg-surface">
      <div className="max-w-[860px] mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link to="/dashboard" className="flex items-center gap-2.5 no-underline text-fg">
          <Logo />
          <span className="text-lg font-bold">Vanminton</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={toggle}
            className="h-9 px-3 rounded-md border border-line-strong bg-surface text-fg text-sm font-bold cursor-pointer hover:bg-subtle"
          >
            {resolved === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
