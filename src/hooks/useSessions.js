import { useEffect, useMemo, useState } from "react";
import { getSessions, signup as apiSignup, getSignups } from "../api";

export default function useSessions(groupId) {
  const [sessions, setSessions] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [openSessionId, setOpenSessionId] = useState(null);
  const [signupsBySession, setSignupsBySession] = useState({});
  const [toast, setToast] = useState(null);

  const nameTrimmed = useMemo(() => name.trim(), [name]);

  useEffect(() => {
    if (!groupId.trim()) return;

    let cancelled = false;

    async function fetchSessions() {
      setLoading(true);
      const data = await getSessions(groupId);
      if (!cancelled) {
        setSessions(data);
        setOpenSessionId(null);
        setSignupsBySession({});
        setLoading(false);
      }
    }

    fetchSessions();

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  async function refreshSessions() {
    setLoading(true);
    const data = await getSessions(groupId);
    setSessions(data);
    setLoading(false);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const signup = async (sessionId) => {
    if (!groupId.trim()) {
      setToast({ type: "error", text: "Enter a Group ID first." });
      return;
    }

    if (!nameTrimmed) {
      setToast({ type: "error", text: "Please enter your name." });
      return;
    }

    try {
      await apiSignup(groupId, sessionId, nameTrimmed);
      setName("");
      await refreshSessions();

      if (openSessionId === sessionId) {
        const data = await getSignups(groupId, sessionId);
        setSignupsBySession((prev) => ({ ...prev, [sessionId]: data }));
      }

      setToast({ type: "success", text: "You're registered!" });
    } catch (e) {
      setToast({ type: "error", text: e.message || "Signup failed." });
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
      const data = await getSignups(groupId, sessionId);
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
    signup,
    toggleSignups,
    clearToast,
  };
}
