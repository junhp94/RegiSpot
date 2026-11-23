import { useState } from "react";
import Logo from "../components/Logo";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { INPUT, LABEL, BTN_PRIMARY, ERROR_BOX } from "../lib/styles";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Email/username and password are required.");
      return;
    }
    setBusy(true);
    try {
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
      setError(err.message || "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4 bg-page text-fg">
      <div className="w-full max-w-[400px] p-7 rounded-md bg-surface border border-line">
        <div className="mb-5">
          <Logo className="mb-3 w-12 h-12" />
          <h1 className="text-2xl font-bold m-0 text-fg">Vanminton</h1>
          <p className="text-base text-muted m-0 mt-1">Sign in to see your sessions</p>
        </div>

        {error && <div className={ERROR_BOX}>{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* type="text" so the admin can log in with a username (no @) */}
          <label className={LABEL}>Email or username</label>
          <input
            className={INPUT}
            type="text"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
          />

          <label className={LABEL}>Password</label>
          <input
            className={INPUT}
            type="password"
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />

          <button className={`${BTN_PRIMARY} w-full mt-6`} type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-[15px] text-muted mt-5 mb-0">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="text-accent-text font-bold underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
