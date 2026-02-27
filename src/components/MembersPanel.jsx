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
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      await kickMember(groupId, targetUserId, accessToken);
      setMembers((prev) => prev.filter((m) => m.userId !== targetUserId));
    } catch (e) {
      alert(e.message || "Failed to kick member.");
    }
  }

  async function handleLeave() {
    if (!confirm("Are you sure you want to leave this group?")) return;
    try {
      await leaveGroup(groupId, accessToken);
      if (onLeft) onLeft();
    } catch (e) {
      alert(e.message || "Failed to leave group.");
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center px-3.5 py-3 rounded-xl bg-white/72 dark:bg-slate-800/80 border border-slate-900/10 dark:border-slate-400/15">
            <SkeletonLine width="60%" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {members.map((m) => (
        <div
          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/72 dark:bg-slate-800/80 border border-slate-900/10 dark:border-slate-400/15"
          key={m.userId}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-[22px] h-[22px] rounded-full grid place-items-center text-xs font-extrabold text-blue-600 dark:text-blue-400 bg-blue-600/12 dark:bg-blue-500/20 border border-blue-600/18 dark:border-blue-400/25">
              {(m.nickname || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">
              {m.nickname}
            </span>
            <span className="text-xs text-slate-900/65 dark:text-slate-400">
              ({m.role})
            </span>
          </div>
          <div>
            {isOwner && m.role !== "owner" && (
              <button className={BTN_DANGER} onClick={() => handleKick(m.userId)}>
                Kick
              </button>
            )}
            {!isOwner && m.userId === user?.userId && (
              <button className={BTN_DANGER} onClick={handleLeave}>
                Leave
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
