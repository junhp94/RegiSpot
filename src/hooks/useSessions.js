import { useEffect, useState } from "react";
import {
  getSessions,
  signup as apiSignup,
  unregister as apiUnregister,
  getSignups,
  createSession as apiCreateSession,
  deleteSession as apiDeleteSession,
  updateSession as apiUpdateSession,
  removeSignup as apiRemoveSignup,
  addCourt as apiAddCourt,
} from "../api";
import { useAuth } from "../auth/useAuth";

// view: "upcoming" | "scheduled" | "past" — only the owner's request honours it.
// signupsBySession[id] = { registered: [...], waitlist: [...] }
export default function useSessions(groupId, view = "upcoming") {
  const { accessToken, isAuthenticated } = useAuth();

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openSessionId, setOpenSessionId] = useState(null);
  const [signupsBySession, setSignupsBySession] = useState({});
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!groupId?.trim() || !isAuthenticated) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchSessions() {
      setLoading(true);
      try {
        const data = await getSessions(groupId, accessToken, view);
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
  }, [groupId, accessToken, isAuthenticated, view]);

  async function refreshSessions() {
    if (!isAuthenticated) return;
    try {
      const data = await getSessions(groupId, accessToken, view);
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

  // After any change, the cached lists are stale.
  // Refetch if open; otherwise drop so the next open refetches.
  async function refreshSignups(sessionId) {
    if (openSessionId === sessionId) {
      const data = await getSignups(groupId, sessionId, accessToken);
      setSignupsBySession((prev) => ({ ...prev, [sessionId]: data }));
    } else {
      setSignupsBySession((prev) => {
        const next = { ...prev };
        delete next[sessionId];
        return next;
      });
    }
  }

  // Runs an action, refreshes the card and its list, and toasts the outcome.
  async function act(sessionId, fn, successText, failText) {
    try {
      const result = await fn();
      await refreshSessions();
      await refreshSignups(sessionId);
      setToast({ type: "success", text: typeof successText === "function" ? successText(result) : successText });
      return result;
    } catch (e) {
      setToast({ type: "error", text: e.message || failText });
    }
  }

  const signup = (sessionId) =>
    act(
      sessionId,
      () => apiSignup(groupId, sessionId, accessToken),
      (r) => (r.status === "waitlisted"
        ? `You're on the waitlist — #${r.position}`
        : `You're registered — #${r.position}`),
      "Signup failed."
    );

  const unregister = (sessionId) =>
    act(
      sessionId,
      () => apiUnregister(groupId, sessionId, accessToken),
      (r) => (r.was === "waitlisted" ? "You've left the waitlist." : "You've been unregistered."),
      "Unregister failed."
    );

  const removeSignup = (sessionId, userId) =>
    act(
      sessionId,
      () => apiRemoveSignup(groupId, sessionId, userId, accessToken),
      (r) => (r.promoted ? "Removed. Next on the waitlist moved up." : "Removed."),
      "Remove failed."
    );

  const addCourt = (sessionId) =>
    act(
      sessionId,
      () => apiAddCourt(groupId, sessionId, accessToken),
      (r) => `Court added — ${r.capacity} spots${r.promoted ? `, ${r.promoted} moved off the waitlist` : ""}.`,
      "Couldn't add a court."
    );

  const cancelSession = (sessionId, cancelled) =>
    act(
      sessionId,
      () => apiUpdateSession(groupId, sessionId, { cancelled }, accessToken),
      cancelled ? "Session cancelled." : "Session restored.",
      "Update failed."
    );

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
    unregister,
    removeSignup,
    addCourt,
    cancelSession,
    createSession,
    deleteSession: deleteSessionById,
    toggleSignups,
    clearToast,
  };
}
