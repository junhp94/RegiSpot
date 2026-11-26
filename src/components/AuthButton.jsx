import { useState, useEffect, useRef } from "react";
import { useAuth } from "../auth/useAuth";
import ChangePasswordModal from "./ChangePasswordModal";

const MENU_ITEM =
  "block w-full text-left px-3 py-2.5 bg-transparent border-none text-fg text-sm font-bold cursor-pointer hover:bg-subtle";

// "Account" menu (Change password / Sign out) — one button so the top bar
// still fits at phone width.
export default function AuthButton() {
  const { user, loading, logout, isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (loading || !isAuthenticated) return null;

  // The admin signs in with a username (no "@"); its password is managed on Render.
  const isMember = user.email.includes("@");

  return (
    <div className="relative" ref={ref}>
      <button
        className="h-9 px-3 rounded-md border border-line-strong bg-surface text-fg text-sm font-bold cursor-pointer hover:bg-subtle"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        Account
      </button>
      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-md border border-line bg-surface shadow-lg z-20 overflow-hidden"
        >
          <div className="px-3 py-2 text-sm text-muted border-b border-line overflow-hidden text-ellipsis whitespace-nowrap">
            {user.email}
          </div>
          {isMember && (
            <button
              role="menuitem"
              className={MENU_ITEM}
              onClick={() => { setMenuOpen(false); setShowModal(true); }}
            >
              Change password
            </button>
          )}
          <button role="menuitem" className={MENU_ITEM} onClick={logout}>
            Sign out
          </button>
        </div>
      )}
      {showModal && <ChangePasswordModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
