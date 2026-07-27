import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import apiClient from "../api/client";

const ResetPassword = () => {
  const { persistSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefilledEmail = location.state?.email || "";

  const [form, setForm] = useState({
    email: prefilledEmail,
    otpCode: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.newPassword !== form.confirmPassword) {
      return setError("Passwords do not match.");
    }

    setLoading(true);
    try {
      const { data } = await apiClient.post("/auth/reset-password", {
        email: form.email,
        otpCode: form.otpCode,
        newPassword: form.newPassword,
      });

      // Automatically log the user in
      persistSession(data.token, data.user);
      navigate("/browse");
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password. Please check the code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">PASSWORD RECOVERY</p>
        <h1>SET NEW<br /><em>PASSWORD.</em></h1>
        <p>Input the 6-digit code sent to your email along with your new password to regain access.</p>
      </div>
      <div className="card auth-card">
        <div className="auth-card-heading"><span>02 / VERIFY</span><b>Reset credentials</b></div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="otpCode">Verification Code (OTP)</label>
            <input
              id="otpCode"
              name="otpCode"
              type="text"
              maxLength={6}
              placeholder="e.g. 123456"
              value={form.otpCode}
              onChange={handleChange}
              required
              style={{ letterSpacing: "0.1em", fontWeight: "bold" }}
            />
          </div>
          <div className="field">
            <label htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              value={form.newPassword}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Resetting & Logging in…" : "Reset Password & Log in"}
          </button>
        </form>
      </div>
      <p className="auth-switch">
        Remember your password? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
};

export default ResetPassword;
