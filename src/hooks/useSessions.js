import { useEffect, useMemo, useRef, useState } from "react";
import { getSessions, signup as apiSignup, getSignups } from "../api";
import { useAuth } from "../auth/useAuth";

export default function useSessions(groupId) {
  const { accessToken, isAuthenticated, user } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [openSessionId, setOpenSessionId] = useState(null);
  const [signupsBySession, setSignupsBySession] = useState({});
  const [toast, setToast] = useState(null);
  const didPrefillName = useRef(false);

  const nameTrimmed = useMemo(() => name.trim(), [name]);

  // Pre-fill name from Cognito user profile (only once)
  useEffect(() => {
    if (user?.name && !didPrefillName.current) {
      setName(user.name);
      didPrefillName.current = true;
    }
  }, [user?.name]);

  useEffect(() => {
    if (!groupId.trim()) {
      setLoading(false);
      return;
    }
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSessions() {
      setLoading(true);
      try {
        const data = await getSessions(groupId, accessToken);
        if (!cancelled) {
          setSessions(data);
          setOpenSessionId(null);
          setSignupsBySession({});
        }
      } catch (e) {
        if (!cancelled) {
          setToast({ type: "error", text: e.message || "Failed to load sessions." });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSessions();

    return () => {
      cancelled = true;
    };
  }, [groupId, accessToken, isAuthenticated]);

  async function refreshSessions() {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await getSessions(groupId, accessToken);
      setSessions(data);
    } catch (e) {
      setToast({ type: "error", text: e.message || "Failed to refresh sessions." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const signup = async (sessionId) => {
    if (!isAuthenticated) {
      setToast({ type: "error", text: "Please sign in to register." });
      return;
    }

    if (!groupId.trim()) {
      setToast({ type: "error", text: "Enter a Group ID first." });
      return;
    }

    if (!nameTrimmed) {
      setToast({ type: "error", text: "Please enter your name." });
      return;
    }

    try {
      await apiSignup(groupId, sessionId, nameTrimmed, accessToken);
      setName("");
      await refreshSessions();

      if (openSessionId === sessionId) {
        const data = await getSignups(groupId, sessionId, accessToken);
        setSignupsBySession((prev) => ({ ...prev, [sessionId]: data }));
      }

      setToast({ type: "success", text: "You're registered!" });
    } catch (e) {
      setToast({ type: "error", text: e.message || "Signup failed." });
    }
  };

  const toggleSignups = async (sessionId) => {
    if (!isAuthenticated) {
      setToast({ type: "error", text: "Please sign in to view signups." });
      return;
    }

    if (openSessionId === sessionId) {
      setOpenSessionId(null);
      return;
    }
    setOpenSessionId(sessionId);

    if (signupsBySession[sessionId]) return;

    try {
      const data = await getSignups(groupId, sessionId, accessToken);
      setSignupsBySession((prev) => ({
        ...prev,
        [sessionId]: data,
      }));
    } catch (e) {
      setToast({ type: "error", text: e.message || "Failed to load signups." });
    }
  };

  const clearToast = () => setToast(null);

  return {
    sessions,
    name,
    setName,
    loading,
    openSessionId,
    signupsBySession,
    toast,
    setToast,
    signup,
    toggleSignups,
    clearToast,
  };
}
