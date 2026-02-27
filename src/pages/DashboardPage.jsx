import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import useGroups from "../hooks/useGroups";
import CreateGroupModal from "../components/CreateGroupModal";
import JoinGroupModal from "../components/JoinGroupModal";
import { CARD, BTN_PRIMARY, BTN_GHOST } from "../lib/styles";
import { getSportConfig } from "../lib/sportConfig";
import { SkeletonGrid } from "../components/Skeleton";
import EmptyState from "../components/EmptyState";

export default function DashboardPage() {
  const { groups, loading, createGroup, joinGroup } = useGroups();
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [sportFilter, setSportFilter] = useState(null);

  const sportTypes = useMemo(() => {
    const types = [...new Set(groups.map((g) => g.sportType))];
    return types;
  }, [groups]);

  const showFilters = sportTypes.length >= 2;

  const filteredGroups = sportFilter
    ? groups.filter((g) => g.sportType === sportFilter)
    : groups;

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-xl font-bold m-0 text-slate-900 dark:text-slate-100">My Groups</h2>
        </div>
        <SkeletonGrid count={4} />
      </>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="text-xl font-bold m-0 text-slate-900 dark:text-slate-100">
          My Groups
        </h2>
        <div className="flex gap-2">
          <button className={BTN_PRIMARY} onClick={() => setShowCreate(true)}>
            Create Group
          </button>
          <button className={BTN_GHOST} onClick={() => setShowJoin(true)}>
            Join Group
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          <button
            onClick={() => setSportFilter(null)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-colors whitespace-nowrap ${
              sportFilter === null
                ? "bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/25 dark:border-blue-400/30 text-blue-600 dark:text-blue-400"
                : "bg-white/55 dark:bg-slate-700/50 border-slate-900/10 dark:border-slate-400/15 text-slate-900/65 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-700/70"
            }`}
          >
            All
          </button>
          {sportTypes.map((st) => {
            const cfg = getSportConfig(st);
            return (
              <button
                key={st}
                onClick={() => setSportFilter(sportFilter === st ? null : st)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border cursor-pointer transition-colors whitespace-nowrap ${
                  sportFilter === st
                    ? "bg-blue-600/10 dark:bg-blue-500/20 border-blue-600/25 dark:border-blue-400/30 text-blue-600 dark:text-blue-400"
                    : "bg-white/55 dark:bg-slate-700/50 border-slate-900/10 dark:border-slate-400/15 text-slate-900/65 dark:text-slate-400 hover:bg-white/80 dark:hover:bg-slate-700/70"
                }`}
              >
                {cfg.emoji} {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      {groups.length === 0 ? (
        <EmptyState
          icon="👋"
          title="Welcome to RegiSpot"
          description="Create a group or join one with an access code to get started."
          actionLabel="Create Group"
          onAction={() => setShowCreate(true)}
        />
      ) : filteredGroups.length === 0 ? (
        <EmptyState
          icon="🔍"
          description="No groups match this filter."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredGroups.map((g) => {
            const cfg = getSportConfig(g.sportType);
            return (
              <Link
                key={g.groupId}
                to={`/groups/${g.groupId}`}
                className={`${CARD} border-l-4 ${cfg.borderColor} no-underline text-inherit cursor-pointer transition-all duration-150 hover:shadow-xl hover:-translate-y-0.5`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-bold tracking-tight text-[15px] text-slate-900 dark:text-slate-100">
                      {cfg.emoji} {g.groupName}
                    </div>
                    <div className="mt-1 text-[13px] text-slate-900/65 dark:text-slate-400">
                      {g.sportType} · {g.role}
                    </div>
                  </div>
                </div>
                <div className="h-px bg-slate-900/8 dark:bg-slate-400/10 my-3" />
                <div className="text-[13px] text-slate-900/65 dark:text-slate-400">
                  Nickname: <strong className="text-slate-900 dark:text-slate-100">{g.nickname}</strong>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onSubmit={createGroup}
          onClose={() => setShowCreate(false)}
        />
      )}
      {showJoin && (
        <JoinGroupModal
          onSubmit={joinGroup}
          onClose={() => setShowJoin(false)}
        />
      )}
    </>
  );
}
