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
      <div className="min-h-screen flex items-center justify-center bg-page text-fg">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-7 px-4 bg-page text-fg">
      <JoinGroupModal
        onSubmit={handleJoin}
        onClose={handleClose}
        initialAccessCode={accessCode}
      />
    </div>
  );
}
