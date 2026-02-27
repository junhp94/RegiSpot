import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider as AmplifyAuthProvider } from "./auth/AuthContext";
import { AuthProvider } from "react-oidc-context";

const cognitoAuthConfig = {
  authority: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_UVIOYHcQC",
  client_id: "62n6es0a6pcanj4sakpirvenlc",
  redirect_uri: "http://localhost:5173",
  response_type: "code",
  scope: "email openid phone",
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <BrowserRouter>
        <ThemeProvider>
          <AmplifyAuthProvider>
            <App />
          </AmplifyAuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
