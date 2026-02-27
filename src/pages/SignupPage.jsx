import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { INPUT, LABEL, BTN_PRIMARY, ERROR_BOX } from "../lib/styles";

export default function SignupPage() {
  const { register, confirmAccount, login } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleRegister(e) {
    e.preventDefault();
    setError("");
    if (!name.trim() || !email.trim() || !password) {
      setError("All fields are required.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await register(email.trim(), password, name.trim());
      setStep("confirm");
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setError("");
    if (!code.trim()) {
      setError("Confirmation code is required.");
      return;
    }
    setBusy(true);
    try {
      await confirmAccount(email.trim(), code.trim());
      const result = await login(email.trim(), password);
      if (result.isSignedIn) {
        const pendingCode = sessionStorage.getItem("regispot-pending-join");
        if (pendingCode) {
          sessionStorage.removeItem("regispot-pending-join");
          navigate(`/join/${pendingCode}`, { replace: true });
        } else {
          navigate("/dashboard", { replace: true });
        }
      }
    } catch (err) {
      setError(err.message || "Confirmation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-7 px-4 bg-gradient-to-br from-bg2 via-transparent to-transparent bg-bg1 text-text dark:bg-dark-bg1 dark:text-dark-text">
      <div className="w-full max-w-[400px] p-8 rounded-2xl bg-white/72 dark:bg-slate-800/90 border border-slate-900/10 dark:border-slate-400/15 shadow-lg shadow-slate-900/10 dark:shadow-black/20 backdrop-blur-sm">
        <div className="text-center mb-6">
          <div className="w-11 h-11 rounded-[14px] grid place-items-center bg-white/70 dark:bg-slate-700/60 border border-slate-900/10 dark:border-slate-400/15 shadow-md shadow-slate-900/8 mx-auto mb-3">
            🏸
          </div>
          <div className="text-[22px] font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-1">
            RegiSpot
          </div>
          <p className="text-sm text-slate-900/65 dark:text-slate-400 mt-1 mb-0">
            {step === "register" ? "Create your account" : "Confirm your email"}
          </p>
        </div>

        {error && <div className={ERROR_BOX}>{error}</div>}

        {step === "register" ? (
          <form onSubmit={handleRegister}>
            <label className={LABEL}>Name</label>
            <input
              className={INPUT}
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />

            <label className={LABEL}>Email</label>
            <input
              className={INPUT}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />

            <label className={LABEL}>Password</label>
            <input
              className={INPUT}
              type="password"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />

            <button className={`${BTN_PRIMARY} w-full mt-5 text-sm`} type="submit" disabled={busy}>
              {busy ? "Creating account..." : "Sign Up"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirm}>
            <p className="text-[13px] text-slate-900/65 dark:text-slate-400 m-0 mb-3">
              We sent a confirmation code to <strong className="text-slate-900 dark:text-slate-100">{email}</strong>
            </p>
            <label className={LABEL}>Confirmation Code</label>
            <input
              className={INPUT}
              type="text"
              placeholder="Enter 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
            />

            <button className={`${BTN_PRIMARY} w-full mt-5 text-sm`} type="submit" disabled={busy}>
              {busy ? "Confirming..." : "Confirm & Sign In"}
            </button>
          </form>
        )}

        <p className="text-center text-[13px] text-slate-900/65 dark:text-slate-400 mt-5">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 dark:text-blue-400 no-underline font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
