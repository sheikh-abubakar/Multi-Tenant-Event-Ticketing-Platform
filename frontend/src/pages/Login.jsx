import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import GoogleSignInButton from "../components/GoogleSignInButton";
import AnimatedEyeIcon from "../components/AnimatedEyeIcon";

import { claimGuestCart } from "../utils/cart";

const Login = () => {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const prefilledEmail = location.state?.email || "";
  const [form, setForm] = useState({ email: prefilledEmail, password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem("unlockedCodes");
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleGoogleSuccess = async (credential) => {
    setError(""); setLoading(true);
    try {
      const result = await loginWithGoogle(credential);
      await claimGuestCart();
      navigate(result.user.platformRole === "super_admin" ? "/platform-admin" : result.user.requiresPasswordSetup ? "/set-password" : "/browse");
    }
    catch (err) { setError(err.response?.data?.message || "Google sign-in failed. Please try again."); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(form);
      await claimGuestCart();
      navigate(result.user.platformRole === "super_admin" ? "/platform-admin" : "/browse");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">WELCOME BACK</p>
        <h1>BACK TO<br /><em>THE SHOW.</em></h1>
        <p>Log in to manage your events, tickets, bookings and the next big moment.</p>
      </div>
      <div className="card auth-card">
        <div className="auth-card-heading"><span>01 / SECURE ENTRY</span><b>Your stage is waiting.</b></div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label htmlFor="password" style={{ margin: 0 }}>Password</label>
              <Link to="/forgot-password" style={{ fontSize: 12, color: "var(--gold-soft)" }}>Forgot password?</Link>
            </div>
            <div className="password-input-wrapper">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                <AnimatedEyeIcon isOpen={showPassword} />
              </button>
            </div>
          </div>
          <button className="btn btn-primary auth-submit" type="submit" disabled={loading} style={{ width: "100%" }}>
            {loading ? "Logging in…" : "Log in"}
          </button>
        </form>
        <GoogleSignInButton onSuccess={handleGoogleSuccess} onError={setError} />
      </div>
      <p className="auth-switch">
        Don't have an account? <Link to="/signup">Sign up</Link>
      </p>
    </div>
  );
};

export default Login;
