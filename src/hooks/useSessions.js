import { useEffect, useState } from "react";
import {
  getSessions,
  signup as apiSignup,
  getSignups,
  createSession as apiCreateSession,
  deleteSession as apiDeleteSession,
} from "../api";
import { useAuth } from "../auth/useAuth";

export default function useSessions(groupId) {
  const { accessToken, isAuthenticated } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSessionId, setOpenSessionId] = useState(null);
  const [signupsBySession, setSignupsBySession] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!groupId?.trim()) {
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
        if (!cancelled) setLoading(false);
      }
    }

    fetchSessions();
    return () => { cancelled = true; };
  }, [groupId, accessToken, isAuthenticated]);

  async function refreshSessions() {
    if (!isAuthenticated) return;
    try {
      const data = await getSessions(groupId, accessToken);
      setSessions(data);
    } catch (e) {
      setToast({ type: "error", text: e.message || "Failed to refresh sessions." });
    }
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const signup = async (sessionId) => {
    try {
      await apiSignup(groupId, sessionId, accessToken);
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

  const createSession = async (params) => {
    const result = await apiCreateSession(groupId, params, accessToken);
    await refreshSessions();
    setToast({ type: "success", text: "Session created!" });
    return result;
  };

  const deleteSessionById = async (sessionId) => {
    try {
      await apiDeleteSession(groupId, sessionId, accessToken);
      await refreshSessions();
      setSignupsBySession((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
      if (openSessionId === sessionId) setOpenSessionId(null);
      setToast({ type: "success", text: "Session deleted." });
    } catch (e) {
      setToast({ type: "error", text: e.message || "Delete failed." });
    }
  };

  const toggleSignups = async (sessionId) => {
    if (openSessionId === sessionId) {
      setOpenSessionId(null);
      return;
    }
    setOpenSessionId(sessionId);

    if (signupsBySession[sessionId]) return;

    try {
      const data = await getSignups(groupId, sessionId, accessToken);
      setSignupsBySession((prev) => ({ ...prev, [sessionId]: data }));
    } catch (e) {
      setToast({ type: "error", text: e.message || "Failed to load signups." });
    }
  };

  const clearToast = () => setToast(null);

  return {
    sessions,
    loading,
    openSessionId,
    signupsBySession,
    toast,
    setToast,
    signup,
    createSession,
    deleteSession: deleteSessionById,
    toggleSignups,
    clearToast,
  };
}
