import { useState } from "react";
import Login from "./pages/Login";
import Register from "./pages/Register";
import HRDashboard from "./pages/HRDashboard";
import CandidateDashboard from "./pages/CandidateDashboard";

import ProtectedRoute from "./components/ProtectedRoute";

import "./App.css";

export default function App() {
  const [authData, setAuthData] = useState(() => {
    try {
      const saved = localStorage.getItem("interview_auth");

      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error("Unable to restore authentication:", error);

      localStorage.removeItem("interview_auth");

      return null;
    }
  });

  const [page, setPage] = useState("login");

  // Handle successful login or registration
 function handleLogin(data) {
  if (!data?.access_token || !data?.user) {
    console.error("Invalid login response:", data);
    return;
  }

  localStorage.setItem("interview_auth", JSON.stringify(data));
  setAuthData(data);
}

function handleLogout() {
  localStorage.removeItem("interview_auth");
  setAuthData(null);
  setPage("login");
}
  // Display the appropriate dashboard based on the user's role
  if (authData?.user) {
    const user = authData.user;

    if (user.role === "hr") {
      return (
        <ProtectedRoute
          user={user}
          allowedRole="hr"
        >
          <HRDashboard
            user={user}
            onLogout={handleLogout}
          />
        </ProtectedRoute>
      );
    }

    if (user.role === "candidate") {
  return (
    <ProtectedRoute
      user={user}
      allowedRole="candidate"
    >
      <CandidateDashboard
        user={user}
        authData={authData}
        onLogout={handleLogout}
      />
    </ProtectedRoute>
  );
}

    // Invalid or unsupported role
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h2>Access Denied</h2>

          <p>Your account has an unsupported role.</p>

          <button onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Registration page
  if (page === "register") {
    return (
      <Register
        onRegister={handleLogin}
        onNavigate={() => setPage("login")}
      />
    );
  }

  // Login page
  return (
    <Login
      onLogin={handleLogin}
      onNavigate={() => setPage("register")}
    />
  );
}