import { useState, useEffect } from "react";
import { getMembers, kickMember, leaveGroup, updateNickname } from "../api";
import { useAuth } from "../auth/useAuth";
import { BTN_DANGER, INPUT } from "../lib/styles";

const BTN_SMALL =
  "h-8 px-3 rounded-md border border-line-strong bg-surface text-fg text-sm font-bold cursor-pointer hover:bg-subtle disabled:opacity-50 disabled:cursor-not-allowed";
import { SkeletonLine } from "./Skeleton";

export default function MembersPanel({ groupId, isOwner, onLeft, onRenamed }) {
  const { accessToken, user } = useAuth();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

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

  function startEdit(m) {
    setEditingId(m.userId);
    setDraft(m.nickname);
    setEditError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError("");
  }

  async function saveEdit() {
    const nickname = draft.trim();
    if (!nickname || saving) return;
    setSaving(true);
    setEditError("");
    try {
      const res = await updateNickname(groupId, editingId, nickname, accessToken);
      setMembers((prev) => prev.map((m) => (m.userId === res.userId ? { ...m, nickname: res.nickname } : m)));
      if (onRenamed) onRenamed(res.userId, res.nickname);
      setEditingId(null);
    } catch (e) {
      setEditError(e.message || "Couldn't change nickname.");
    } finally {
      setSaving(false);
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
          {editingId === m.userId ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <input
                  className={`${INPUT} h-9`}
                  value={draft}
                  maxLength={30}
                  autoFocus
                  aria-label="Nickname"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveEdit();
                    if (e.key === "Escape") cancelEdit();
                  }}
                />
                <button className={BTN_SMALL} onClick={saveEdit} disabled={saving || !draft.trim()}>
                  {saving ? "Saving..." : "Save"}
                </button>
                <button className={BTN_SMALL} onClick={cancelEdit} disabled={saving}>
                  Cancel
                </button>
              </div>
              {editError && <p className="m-0 mt-1 text-sm text-danger">{editError}</p>}
            </div>
          ) : (
            <div className="min-w-0">
              <span className="font-bold text-fg">{m.nickname}</span>
              {m.role === "owner" && <span className="ml-2 text-sm text-muted">Owner</span>}
              {m.userId === user?.userId && <span className="ml-2 text-sm text-muted">(you)</span>}
            </div>
          )}
          <div className="flex gap-2 shrink-0">
            {editingId !== m.userId && (isOwner || m.userId === user?.userId) && (
              <button className={BTN_SMALL} onClick={() => startEdit(m)}>
                Edit
              </button>
            )}
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
