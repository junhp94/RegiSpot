import { useState } from "react";
import { Navigate } from "react-router-dom";
import useGroups from "../hooks/useGroups";
import JoinGroupModal from "../components/JoinGroupModal";
import { BTN_PRIMARY } from "../lib/styles";
import { SkeletonGrid } from "../components/Skeleton";
import { HOME_GROUP_ID, CLUB_NAME } from "../lib/club";

// Single-club app: send members straight to the club's sessions.
// Anyone who isn't a member yet gets a way to join with the access code.
export default function DashboardPage() {
  const { groups, loading, joinGroup } = useGroups();
  const [showJoin, setShowJoin] = useState(false);

  if (loading) return <SkeletonGrid count={3} />;

  const home = groups.find((g) => g.groupId === HOME_GROUP_ID) || groups[0];
  if (home) return <Navigate to={`/groups/${home.groupId}`} replace />;

  return (
    <>
      <div className="py-10 px-6 border border-dashed border-line-strong rounded-md">
        <h1 className="text-xl font-bold m-0 mb-1 text-fg">Join {CLUB_NAME}</h1>
        <p className="text-base text-muted m-0 mb-4">
          Open the invite link the club shared, or enter the 6-digit access code.
        </p>
        <button className={BTN_PRIMARY} onClick={() => setShowJoin(true)}>
          Enter access code
        </button>
      </div>

      {showJoin && (
        <JoinGroupModal onSubmit={joinGroup} onClose={() => setShowJoin(false)} />
      )}
    </>
  );
}
