import { useState } from "react";

// Group logo shown in the top bar and on the login/signup pages.
// Drop the image at public/logo.png; until it exists (or if it fails to load)
// the 🏸 emoji is shown instead, so the build never breaks on a missing file.
const LOGO_SRC = `${import.meta.env.BASE_URL}logo.png`;

export default function Logo({ className = "" }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className={`w-11 h-11 rounded-[14px] grid place-items-center overflow-hidden bg-white/70 dark:bg-slate-700/60 border border-slate-900/10 dark:border-slate-400/15 shadow-md shadow-slate-900/8 ${className}`}
    >
      {failed ? (
        "🏸"
      ) : (
        <img
          src={LOGO_SRC}
          alt="Vanminton logo"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
