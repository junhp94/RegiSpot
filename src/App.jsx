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
    <div>
      <button onClick={() => auth.signinRedirect()}>Sign in</button>
      <button onClick={() => signOutRedirect()}>Sign out</button>
    </div>
  );
}

export default App;
