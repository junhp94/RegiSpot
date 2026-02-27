import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import useGroups from "../hooks/useGroups";
import JoinGroupModal from "../components/JoinGroupModal";

export default function JoinPage() {
  const { accessCode } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const { joinGroup } = useGroups();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) {
      sessionStorage.setItem("regispot-pending-join", accessCode);
      navigate("/login", { replace: true });
    }
  }, [loading, isAuthenticated, accessCode, navigate]);

  const showModal = !loading && isAuthenticated && !dismissed;

  async function handleJoin(params) {
    const result = await joinGroup(params);
    const groupId = result?.groupId;
    if (groupId) {
      navigate(`/groups/${groupId}`, { replace: true });
    } else {
      navigate("/dashboard", { replace: true });
    }
  }

  function handleClose() {
    setDismissed(true);
    navigate("/dashboard", { replace: true });
  }

  if (!showModal) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg1 dark:bg-dark-bg1 text-text dark:text-dark-text">
        <p className="text-slate-900/65 dark:text-slate-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-7 px-4 bg-gradient-to-br from-bg2 via-transparent to-transparent bg-bg1 text-text dark:bg-dark-bg1 dark:text-dark-text">
      <JoinGroupModal
        onSubmit={handleJoin}
        onClose={handleClose}
        initialAccessCode={accessCode}
      />
    </div>
  );
}
