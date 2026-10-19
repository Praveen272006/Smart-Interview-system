import { useState } from "react";
import api from "../api";

export default function Login({ onLogin, onNavigate }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        email,
        password,
      });

      console.log("Login successful:", response.data.user);

      onLogin(response.data);
    } catch (error) {
      console.error("Login error:", error);
      console.error("Response:", error.response?.data);
      console.error("Status:", error.response?.status);

      if (error.response) {
        setError(
          error.response.data?.detail ||
            `Login failed with status ${error.response.status}`
        );
      } else if (error.code === "ERR_NETWORK") {
        setError(
          "Cannot connect securely to the backend. Check HTTPS and the browser console."
        );
      } else {
        setError(error.message || "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-icon">AI</div>

        <h1>Welcome Back</h1>

        <p className="subtitle">
          Sign in to your Smart Online Interview account.
        </p>

        <form onSubmit={handleSubmit}>
          <label>Email Address</label>

          <input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <label>Password</label>

          <input
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className="switch-text">
          Don't have an account?{" "}
          <button
            className="text-button"
            onClick={onNavigate}
            type="button"
          >
            Create Account
          </button>
        </p>
      </div>
    </div>
  );
}