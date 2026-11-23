import { useState, useEffect } from "react";
import { getMembers, kickMember, leaveGroup } from "../api";
import { useAuth } from "../auth/useAuth";
import { BTN_DANGER } from "../lib/styles";
import { SkeletonLine } from "./Skeleton";

export default function MembersPanel({ groupId, isOwner, onLeft }) {
  const { accessToken, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getMembers(groupId, accessToken);
        if (!cancelled) setMembers(data);
      } catch (e) {
        console.error("Failed to load members:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [groupId, accessToken]);

  async function handleKick(targetUserId) {
    if (!confirm("Remove this member from the group?")) return;
    try {
      await kickMember(groupId, targetUserId, accessToken);
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
    } catch (e) {
      alert(e.message || "Couldn't remove member.");
    }
  }

  async function handleLeave() {
    if (!confirm("Leave this group?")) return;
    try {
      await leaveGroup(groupId, accessToken);
      if (onLeft) onLeft();
    } catch (e) {
      alert(e.message || "Couldn't leave group.");
    }
  }

  if (loading) {
    return (
      <div className="rounded-md border border-line bg-surface px-4 py-2">
        {[1, 2, 3].map((i) => (
          <SkeletonLine key={i} width="50%" />
        ))}
      </div>
    );
  }

  return (
    <ul className="m-0 p-0 list-none rounded-md border border-line bg-surface divide-y divide-line">
      {members.map((m) => (
        <li className="flex items-center justify-between gap-3 px-4 py-3" key={m.userId}>
          <div>
            <span className="font-bold text-fg">{m.nickname}</span>
            {m.role === "owner" && <span className="ml-2 text-sm text-muted">Owner</span>}
            {m.userId === user?.userId && <span className="ml-2 text-sm text-muted">(you)</span>}
          </div>
          <div>
            {isOwner && m.role !== "owner" && (
              <button className={BTN_DANGER} onClick={() => handleKick(m.userId)}>
                Remove
              </button>
            )}
            {!isOwner && m.userId === user?.userId && (
              <button className={BTN_DANGER} onClick={handleLeave}>
                Leave group
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
