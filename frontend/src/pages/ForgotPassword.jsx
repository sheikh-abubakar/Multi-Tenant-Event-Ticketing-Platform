import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import apiClient from "../api/client";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiClient.post("/auth/forgot-password", { email });
      navigate("/reset-password", { state: { email } });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to request password reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">PASSWORD RECOVERY</p>
        <h1>RESET YOUR<br /><em>CREDENTIALS.</em></h1>
        <p>Enter your email address to receive a 6-digit OTP code to verify your request.</p>
      </div>
      <div className="card auth-card">
        <div className="auth-card-heading"><span>01 / IDENTIFY</span><b>Request OTP Code</b></div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Sending Code…" : "Send Verification Code"}
          </button>
        </form>
      </div>
      <p className="auth-switch">
        Remember your password? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
};

export default ForgotPassword;
