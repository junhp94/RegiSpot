import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getGroup } from "../api";
import { useAuth } from "../auth/useAuth";
import useSessions from "../hooks/useSessions";
import SessionCard from "../components/SessionCard";
import CreateSessionModal from "../components/CreateSessionModal";
import MembersPanel from "../components/MembersPanel";
import Toast from "../components/Toast";
import { BTN_PRIMARY } from "../lib/styles";
import { getSportConfig } from "../lib/sportConfig";
import { SkeletonGrid, SkeletonLine } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";

export default function GroupPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [group, setGroup] = useState(null);
  const [groupLoading, setGroupLoading] = useState(true);
  const [tab, setTab] = useState("sessions");
  const [showCreateSession, setShowCreateSession] = useState(false);

  const {
    sessions,
    loading: sessionsLoading,
    openSessionId,
    signupsBySession,
    toast,
    signup,
    unregister,
    createSession,
    deleteSession,
    toggleSignups,
    clearToast,
  } = useSessions(groupId);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await getGroup(groupId, accessToken);
        if (!cancelled) setGroup(data);
      } catch (e) {
        console.error("Failed to load group:", e);
        if (!cancelled) navigate("/dashboard", { replace: true });
      } finally {
        if (!cancelled) setGroupLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [groupId, accessToken, navigate]);

  if (groupLoading) {
    return (
      <div>
        <div className="mb-5">
          <SkeletonLine width="40%" />
          <SkeletonLine width="60%" />
        </div>
        <SkeletonGrid count={4} />
      </div>
    );
  }

  if (!group) return null;

  const isOwner = group.membership?.role === "owner";
  const sportCfg = getSportConfig(group.sportType);

  async function handleCopyInviteLink() {
    const link = `${window.location.origin}/join/${group.accessCode}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // fallback silently
    }
  }

  return (
    <>
      <Toast toast={toast} onClose={clearToast} />

      <div className="mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-[22px] font-bold m-0 text-slate-900 dark:text-slate-100">
            {sportCfg.emoji} {group.groupName}
          </h2>
          {isOwner && (
            <div className="flex gap-2">
              <button className={BTN_PRIMARY} onClick={() => setShowCreateSession(true)}>
                Create Session
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-3 flex-wrap mt-2 text-[13px] text-slate-900/65 dark:text-slate-400">
          <span>{group.sportType}</span>
          <span>{group.memberCount} member{group.memberCount !== 1 ? "s" : ""}</span>
          <span>
            Nickname: <strong className="text-slate-900 dark:text-slate-100">{group.membership?.nickname}</strong>
          </span>
          {isOwner && group.accessCode && (
            <span className="flex items-center gap-2">
              Access Code:{" "}
              <span className="font-mono text-sm font-bold tracking-widest text-blue-600 dark:text-blue-400 bg-blue-600/10 dark:bg-blue-500/20 px-2 py-0.5 rounded-md">
                {group.accessCode}
              </span>
              <button
                onClick={handleCopyInviteLink}
                className="text-xs text-blue-600 dark:text-blue-400 bg-blue-600/10 dark:bg-blue-500/20 border border-blue-600/20 dark:border-blue-400/25 rounded-md px-2 py-0.5 cursor-pointer hover:bg-blue-600/18 dark:hover:bg-blue-500/30 transition-colors"
                title="Copy invite link"
              >
                Copy link
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        <button
          className={`h-9 px-4 rounded-[10px] border font-semibold text-[13px] cursor-pointer transition-colors ${
            tab === "sessions"
              ? "bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/18 dark:border-blue-400/25 text-blue-600 dark:text-blue-400"
              : "bg-transparent border-slate-900/10 dark:border-slate-400/15 text-slate-900/65 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
          onClick={() => setTab("sessions")}
        >
          Sessions
        </button>
        <button
          className={`h-9 px-4 rounded-[10px] border font-semibold text-[13px] cursor-pointer transition-colors ${
            tab === "members"
              ? "bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/18 dark:border-blue-400/25 text-blue-600 dark:text-blue-400"
              : "bg-transparent border-slate-900/10 dark:border-slate-400/15 text-slate-900/65 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
          onClick={() => setTab("members")}
        >
          Members
        </button>
      </div>

      {tab === "sessions" && (
        sessionsLoading ? (
          <SkeletonGrid count={4} />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No sessions yet"
            description={isOwner ? "Create your first session to get started." : "No sessions have been created yet."}
            actionLabel={isOwner ? "Create Session" : undefined}
            onAction={isOwner ? () => setShowCreateSession(true) : undefined}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isOpen={openSessionId === session.id}
                signups={signupsBySession[session.id] || []}
                isOwner={isOwner}
                onRegister={signup}
                onUnregister={unregister}
                onDelete={deleteSession}
                onToggle={toggleSignups}
              />
            ))}
          </div>
        )
      )}

      {tab === "members" && (
        <MembersPanel
          groupId={groupId}
          isOwner={isOwner}
          onLeft={() => navigate("/dashboard", { replace: true })}
        />
      )}

      {showCreateSession && (
        <CreateSessionModal
          onSubmit={createSession}
          onClose={() => setShowCreateSession(false)}
          sportType={group.sportType}
        />
      )}
    </>
  );
}
