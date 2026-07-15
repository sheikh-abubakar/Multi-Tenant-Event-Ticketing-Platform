import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const Home = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [slug, setSlug] = useState("");

  const goToOrg = (e) => {
    e.preventDefault();
    if (slug.trim()) navigate(`/o/${slug.trim()}/dashboard`);
  };

  if (!user) {
    return (
      <div style={{ textAlign: "center", marginTop: 60 }}>
        <h1 style={{ color: "var(--paper)", fontSize: 48 }}>Stagepass</h1>
        <p style={{ color: "var(--muted)", fontSize: 18, marginBottom: 32 }}>
          One platform, every organizer's own storefront.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button className="btn btn-primary" onClick={() => navigate("/signup")}>
            Sign up
          </button>
          <button className="btn btn-ghost" onClick={() => navigate("/login")} style={{ color: "var(--paper)", borderColor: "rgba(247,242,231,0.35)" }}>
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ color: "var(--paper)", marginBottom: 24 }}>Welcome back, {user.name.split(" ")[0]}</h1>

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginTop: 0 }}>Start a new organization</h3>
        <p style={{ color: "var(--muted)", fontSize: 14 }}>
          Create an organization to start listing venues and events.
        </p>
        <button className="btn btn-primary" onClick={() => navigate("/create-organization")}>
          Create organization
        </button>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Go to an existing organization</h3>
        <form onSubmit={goToOrg}>
          <div className="field">
            <label htmlFor="slug">Organization slug</label>
            <input
              id="slug"
              placeholder="e.g. coke-studio-events"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </div>
          <button className="btn btn-ghost" type="submit">
            Go to dashboard
          </button>
        </form>
      </div>
    </div>
  );
};

export default Home;
