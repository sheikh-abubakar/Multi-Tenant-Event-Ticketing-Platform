import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, CheckCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import apiClient from "../api/client";

const SetPassword = () => {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.requiresPasswordSetup) navigate("/browse", { replace: true });
  }, [navigate, user]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (form.newPassword.length < 8) return setError("Password must be at least 8 characters.");
    if (form.newPassword !== form.confirmPassword) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const { data } = await apiClient.put("/auth/password", { newPassword: form.newPassword });
      updateUser(data.user);
      navigate("/browse", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Could not set your password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">ONE LAST STEP</p>
        <h1>Set your<br /><em>password.</em></h1>
        <p>Your Google account is connected. Create a password now to also sign in with your email anytime.</p>
      </div>
      <div className="card auth-card">
        <div className="auth-card-heading"><span>02 / ACCOUNT SECURITY</span><b>Make access easy.</b></div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="newPassword"><Lock size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />New Password</label>
            <input id="newPassword" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} minLength={8} required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input id="confirmPassword" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} minLength={8} required />
          </div>
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Saving Password…" : <><CheckCircle size={16} style={{ marginRight: 7, verticalAlign: "-3px" }} />Set Password & Continue</>}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetPassword;
