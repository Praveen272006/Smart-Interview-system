import { useState } from "react";
import axios from "axios";

const API_URL = "/api";
export default function Register({ onRegister, onNavigate }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("candidate");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await axios.post(
        `${API_URL}/auth/register`,
        {
          full_name: fullName,
          email,
          password,
          role,
        }
      );

      onRegister(response.data);
    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Unable to create your account."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="brand-icon">AI</div>

        <h1>Create Account</h1>

        <p className="subtitle">
          Join the Smart Online Interview System.
        </p>

        <form onSubmit={handleSubmit}>
          <label>Full Name</label>

          <input
            type="text"
            placeholder="Enter your full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />

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
            placeholder="Minimum 8 characters"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <label>Account Type</label>

          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="candidate">Candidate</option>
            <option value="hr">HR / Recruiter</option>
          </select>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="switch-text">
          Already registered?{" "}
          <button
            className="text-button"
            onClick={onNavigate}
            type="button"
          >
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
}