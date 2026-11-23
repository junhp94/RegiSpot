import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getGroup } from "../api";
import { useAuth } from "../auth/useAuth";
import useSessions from "../hooks/useSessions";
import SessionCard from "../components/SessionCard";
import CreateSessionModal from "../components/CreateSessionModal";
import MembersPanel from "../components/MembersPanel";
import Toast from "../components/Toast";
import { BTN_PRIMARY, ERROR_BOX } from "../lib/styles";
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
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState("");

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
        if (!cancelled) setLoadError(e.message || "Couldn't load the group.");
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

  if (loadError) {
    return (
      <div className={ERROR_BOX}>
        {loadError} Check your connection and reload the page.
      </div>
    );
  }

  if (!group) return null;

  const isOwner = group.membership?.role === "owner";

  async function handleCopyInviteLink() {
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    const link = `${window.location.origin}${base}/join/${group.accessCode}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback silently
    }
  }

  const TAB = "h-11 px-1 mr-6 border-0 border-b-[3px] bg-transparent text-[15px] font-bold cursor-pointer";
  const TAB_ON = `${TAB} border-accent text-fg`;
  const TAB_OFF = `${TAB} border-transparent text-muted hover:text-fg`;

  return (
    <>
      <Toast toast={toast} onClose={clearToast} />

      <div className="mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold m-0 text-fg">{group.groupName}</h1>
          {isOwner && (
            <button className={BTN_PRIMARY} onClick={() => setShowCreateSession(true)}>
              New session
            </button>
          )}
        </div>
        <p className="m-0 mt-1 text-[15px] text-muted">
          {group.memberCount} member{group.memberCount !== 1 ? "s" : ""}. You're signed in as{" "}
          <strong className="text-fg">{group.membership?.nickname}</strong>
          {isOwner ? " (organizer)" : ""}.
        </p>

        {isOwner && group.accessCode && (
          <div className="mt-3 flex items-center gap-3 flex-wrap text-[15px] text-fg">
            <span>
              Access code{" "}
              <strong className="font-mono text-lg tracking-wider">{group.accessCode}</strong>
            </span>
            <button
              onClick={handleCopyInviteLink}
              className="h-8 px-3 rounded-md border border-line-strong bg-surface text-fg text-sm font-bold cursor-pointer hover:bg-subtle"
            >
              {copied ? "Link copied" : "Copy invite link"}
            </button>
          </div>
        )}
      </div>

      <div className="flex border-b border-line mb-4" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "sessions"}
          className={tab === "sessions" ? TAB_ON : TAB_OFF}
          onClick={() => setTab("sessions")}
        >
          Sessions
        </button>
        <button
          role="tab"
          aria-selected={tab === "members"}
          className={tab === "members" ? TAB_ON : TAB_OFF}
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
            title="No sessions scheduled"
            description={isOwner ? "Add a date, time and place so members can register." : "When the owner adds a session, it will show up here."}
            actionLabel={isOwner ? "New session" : undefined}
            onAction={isOwner ? () => setShowCreateSession(true) : undefined}
          />
        ) : (
          <div className="flex flex-col gap-3">
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
