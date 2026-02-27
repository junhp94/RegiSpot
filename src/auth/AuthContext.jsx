import { useState, useEffect } from "react";
import { Amplify } from "aws-amplify";
import {
  signIn as amplifySignIn,
  signUp,
  confirmSignUp,
  signOut,
  getCurrentUser,
  fetchAuthSession,
} from "aws-amplify/auth";
import { authConfig } from "./config";
import { AuthContext } from "./context";

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
        userId: currentUser.userId,
        username: currentUser.username,
        email: session.tokens?.idToken?.payload?.email,
        name:
          session.tokens?.idToken?.payload?.name ||
          session.tokens?.idToken?.payload?.email?.split("@")[0],
      });
      setAccessToken(token);
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  }

  async function login(email, password) {
    const result = await amplifySignIn({ username: email, password });
    if (result.isSignedIn) {
      await checkAuth();
    }
    return result;
  }

  async function register(email, password, name) {
    const result = await signUp({
      username: email,
      password,
      options: { userAttributes: { email, name } },
    });
    return result;
  }

  async function confirmAccount(email, code) {
    const result = await confirmSignUp({ username: email, confirmationCode: code });
    return result;
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
    register,
    confirmAccount,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
