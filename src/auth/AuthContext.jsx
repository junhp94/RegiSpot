/**
 * AuthContext — replaces Cognito/Amplify with our own JWT-based auth.
 *
 * Why localStorage + Bearer token instead of a cookie?
 * The frontend is on junhp94.github.io and the API is on onrender.com —
 * two different eTLD+1 domains. Browsers treat cookies set by one domain as
 * "third-party" on the other, and modern browsers block third-party cookies by
 * default (Safari ITP, Chrome's Privacy Sandbox). A Bearer token in
 * localStorage is first-party to the frontend and sent explicitly in the
 * Authorization header, so it works regardless of browser cookie policy.
 *
 * The context interface is kept identical to the Cognito version:
 * { user, accessToken, loading, login, register, logout, isAuthenticated }
 * login() still returns { isSignedIn: true } so LoginPage keeps working.
 */
import { useState, useEffect } from "react";
import { AuthContext } from "./context";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3000";
const TOKEN_KEY = "regispot-token";

// canCreateGroups comes from the server (GROUP_CREATORS env); default true so an
// older API that doesn't send the flag keeps the full feature.
function toUser(u) {
  return { userId: u.userId, email: u.email, name: u.name, canCreateGroups: u.canCreateGroups !== false };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  // Start loading only if a token exists — avoids synchronous setState in effect
  const [loading, setLoading] = useState(() => !!localStorage.getItem(TOKEN_KEY));

  // On mount, restore session from localStorage by validating the stored token
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) return;
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data) => {
        setUser(toUser(data));
        setAccessToken(stored);
      })
      .catch(() => {
        // Token expired or invalid — clear it
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sign in failed");

    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(toUser(data.user));
    setAccessToken(data.token);

    // Return { isSignedIn: true } to match the shape LoginPage expects
    return { isSignedIn: true };
  }

  async function register(email, password, name) {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed");

    // Auto sign-in after register — no confirmation step needed
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(toUser(data.user));
    setAccessToken(data.token);

    return data;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setAccessToken(null);
  }

  return (
    <AuthContext.Provider value={{
      user,
      accessToken,
      loading,
      login,
      register,
      logout,
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
