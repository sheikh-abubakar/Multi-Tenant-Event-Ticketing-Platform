import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import apiClient from "../api/client";

/**
 * AcceptInvite — this is the page the staff member lands on
 * when they click the magic link in their invitation email.
 *
 * URL format: /o/:orgSlug/accept-invite?token=xxx
 *
 * They see a form to set their name (optional) and password.
 * On submit, the backend validates the token, sets the password,
 * and redirects to the login page.
 */
const AcceptInvite = () => {
  const { orgSlug } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get("token");

  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Validate token exists
  if (!token) {
    return (
      <div className="mx-auto" style={{ maxWidth: 480, paddingTop: 60 }}>
        <div className="card">
          <h2 style={{ marginTop: 0, color: "var(--danger)" }}>Invalid Link</h2>
          <p>This invitation link is missing the required token. Please check the link you received in your email.</p>
          <Link to="/login" style={{ color: "var(--gold)" }}>Go to login</Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setAccepting(true);

    try {
      const { data } = await apiClient.post(`/o/${orgSlug}/team/accept-invite`, {
        token,
        name: name.trim() || undefined,
        password,
      });
      setSuccess(data.message || "Account created!");

      // Redirect to login after a short delay
      setTimeout(() => {
        navigate("/login", { state: { email: data.email } });
      }, 2500);
    } catch (err) {
      setError(err.response?.data?.message || "Could not accept invitation.");
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="invite-page mx-auto" style={{ maxWidth: 460, paddingTop: 60 }}>
      {/* Branding */}
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 48,
            color: "var(--gold)",
            margin: 0,
            letterSpacing: "0.06em",
          }}
        >
          StagePass
        </h1>
        <p style={{ color: "var(--muted)", margin: "4px 0 0" }}>
          You've been invited to join <strong style={{ color: "var(--paper)" }}>{orgSlug}</strong>
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: 22 }}>Set up your account</h2>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 24 }}>
          Choose your display name and create a password to access the dashboard.
        </p>

        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">{success}</div>}

        {!success && (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="name">Your name <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span></label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                style={{ padding: "10px 12px", fontSize: 15 }}
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                style={{ padding: "10px 12px", fontSize: 15 }}
              />
            </div>

            <div className="field">
              <label htmlFor="confirmPassword">Confirm password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat your password"
                required
                style={{ padding: "10px 12px", fontSize: 15 }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={accepting}
              style={{ width: "100%", marginTop: 8 }}
            >
              {accepting ? "Setting up…" : "Accept invitation & set password"}
            </button>
          </form>
        )}

        <p style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
          Already have an account? <Link to="/login" style={{ color: "var(--gold)" }}>Log in</Link>
        </p>
      </div>
    </div>
  );
};

export default AcceptInvite;
