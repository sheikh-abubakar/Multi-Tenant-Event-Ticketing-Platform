import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import GoogleSignInButton from "../components/GoogleSignInButton";
import AnimatedEyeIcon from "../components/AnimatedEyeIcon";

import { claimGuestCart } from "../utils/cart";

const Signup = () => {
  const { signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
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
    catch (err) { setError(err.response?.data?.message || "Google sign-up failed. Please try again."); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signup(form);
      await claimGuestCart();
      navigate("/browse");
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-intro">
        <p className="eyebrow">YOUR ALL-ACCESS PASS</p>
        <h1>Create your<br /><em>account.</em></h1>
        <p>Start discovering events, choosing seats and keeping every ticket in one place.</p>
      </div>
      <div className="card auth-card">
        <div className="auth-card-heading"><span>01 / JOIN STAGEPASS</span><b>Make it official.</b></div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input id="name" name="name" value={form.name} onChange={handleChange} required />
          </div>
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
            <label htmlFor="password">Password</label>
            <div className="password-input-wrapper">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={handleChange}
                required
                minLength={8}
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
            {loading ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <GoogleSignInButton onSuccess={handleGoogleSuccess} onError={setError} />
      </div>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
};

export default Signup;
