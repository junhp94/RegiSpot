import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "react-oidc-context";
import LoginPage from "./pages/LoginPage";
import SignupPage from "./pages/SignupPage";
import JoinPage from "./pages/JoinPage";
import DashboardPage from "./pages/DashboardPage";
import GroupPage from "./pages/GroupPage";
import ProtectedRoute from "./components/ProtectedRoute";
import AppLayout from "./components/AppLayout";

function App() {
  const auth = useAuth();

  const signOutRedirect = () => {
    const clientId = "62n6es0a6pcanj4sakpirvenlc";
    const logoutUri = "http://localhost:5173";
    const cognitoDomain = "https://us-east-1uvioyhcqc.auth.us-east-1.amazoncognito.com";
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${encodeURIComponent(logoutUri)}`;
  };

  if (auth.isLoading) {
    return <div>Loading...</div>;
  }

  if (auth.error) {
    return <div>Encountering error... {auth.error.message}</div>;
  }

  if (auth.isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/join/:accessCode" element={<JoinPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/groups/:groupId" element={<GroupPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    );
  }

  return (
    <div className="page">
      <div className="shell">
        <TopBar
          groupId={groupId}
          setGroupId={setGroupId}
          name={name}
          setName={setName}
          setToast={setToast}
        />

        <Toast toast={toast} onClose={clearToast} />

        {!groupId && (
          <div className="welcome-section">
            <h2>Welcome to RegiSpot</h2>
            <p>Create or join a session group to get started.</p>
          </div>
        )}

        <div className="grid">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isOpen={openSessionId === session.id}
              signups={signupsBySession[session.id] || []}
              onRegister={signup}
              onToggle={toggleSignups}
            />
          ))}
        </div>

        <div className="footer">
          <span>Serverless: API Gateway · Lambda · DynamoDB</span>
        </div>
      </div>
    </div>
  );
}

export default App;
