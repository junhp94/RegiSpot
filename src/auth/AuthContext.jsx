import { useState, useEffect } from "react";
import { Amplify } from "aws-amplify";
import {
  signInWithRedirect,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth";
import { authConfig } from "./config";
import { AuthContext } from "./context";

// Configure Amplify
Amplify.configure(authConfig);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();

      setUser({
        username: currentUser.username,
        email: session.tokens?.idToken?.payload?.email,
        name:
          session.tokens?.idToken?.payload?.name ||
          session.tokens?.idToken?.payload?.email?.split("@")[0],
      });
      setAccessToken(token);
    } catch {
      // Not authenticated
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    try {
      await signInWithRedirect();
    } catch (err) {
      console.error("Login error:", err);
    }
  }

  async function logout() {
    try {
      await signOut();
      setUser(null);
      setAccessToken(null);
    } catch (err) {
      console.error("Logout error:", err);
    }
  }

  const value = {
    user,
    accessToken,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
