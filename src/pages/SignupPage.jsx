import { useState } from "react";
import Logo from "../components/Logo";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { INPUT, LABEL, BTN_PRIMARY, ERROR_BOX } from "../lib/styles";

export default function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const pendingCode = sessionStorage.getItem("regispot-pending-join");
      if (pendingCode) {
        sessionStorage.removeItem("regispot-pending-join");
        navigate(`/join/${pendingCode}`, { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err.message || "Registration failed.");
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
          <p className="text-base text-muted m-0 mt-1">Create an account</p>
        </div>

        {error && <div className={ERROR_BOX}>{error}</div>}

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

          <button className={`${BTN_PRIMARY} w-full mt-6`} type="submit" disabled={busy}>
            {busy ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="text-[15px] text-muted mt-5 mb-0">
          Already have an account?{" "}
          <Link to="/login" className="text-accent-text font-bold underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
