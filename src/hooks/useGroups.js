import { useState, useEffect, useCallback } from "react";
import { getUserGroups, createGroup as apiCreateGroup, joinGroup as apiJoinGroup } from "../api";
import { useAuth } from "../auth/useAuth";

export default function useGroups() {
  const { accessToken, isAuthenticated } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await getUserGroups(accessToken);
      setGroups(data);
    } catch (e) {
      console.error("Failed to load groups:", e);
    } finally {
      setLoading(false);
    }
  }, [accessToken, isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function createGroup(params) {
    const result = await apiCreateGroup(params, accessToken);
    await refresh();
    return result;
  }

  async function joinGroupByCode(params) {
    const result = await apiJoinGroup(params, accessToken);
    await refresh();
    return result;
  }

  return { groups, loading, createGroup, joinGroup: joinGroupByCode, refresh };
}
