import { useAuth } from "../auth/useAuth";

export default function AuthButton() {
  const { user, loading, login, logout, isAuthenticated } = useAuth();

  if (loading) {
    return <div className="auth-button loading">Loading...</div>;
  }

  if (isAuthenticated) {
    return (
      <div className="auth-section">
        <span className="user-email">{user.email}</span>
        <button className="auth-button" onClick={logout}>
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button className="auth-button" onClick={login}>
      Sign In
    </button>
  );
}
