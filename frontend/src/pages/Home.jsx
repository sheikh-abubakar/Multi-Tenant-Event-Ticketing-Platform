import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import apiClient from "../api/client";
import OrgCard from "../components/OrgCard";

const Home = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState("");

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    apiClient
      .get("/organizations/mine")
      .then(({ data }) => {
        if (!cancelled) setOrgs(data.organizations);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

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
          <button
            className="btn btn-ghost"
            onClick={() => navigate("/login")}
            style={{ color: "var(--paper)", borderColor: "rgba(247,242,231,0.35)" }}
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ color: "var(--paper)", margin: 0 }}>Welcome back, {user.name.split(" ")[0]}</h1>
        <button className="btn btn-primary" onClick={() => navigate("/create-organization")}>
          + New organization
        </button>
      </div>

      {loading && <p style={{ color: "var(--muted)" }}>Loading your organizations…</p>}

      {!loading && orgs.length === 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>You don't belong to any organization yet</h3>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Create one to start listing venues and events.
          </p>
          <button className="btn btn-primary" onClick={() => navigate("/create-organization")}>
            Create organization
          </button>
        </div>
      )}

      {!loading && orgs.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 18,
            marginBottom: 32,
          }}
        >
          {orgs.map(({ organization, role }) => (
            <OrgCard key={organization.id} organization={organization} role={role} />
          ))}
        </div>
      )}

      <details>
        <summary style={{ color: "var(--muted)", cursor: "pointer", fontSize: 14 }}>
          Have a slug for an organization you're not seeing above?
        </summary>
        <form onSubmit={goToOrg} style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <input
            placeholder="e.g. coke-studio-events"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid rgba(247,242,231,0.25)",
              background: "var(--ink-soft)",
              color: "var(--paper)",
            }}
          />
          <button className="btn btn-ghost" type="submit" style={{ color: "var(--paper)", borderColor: "rgba(247,242,231,0.35)" }}>
            Go
          </button>
        </form>
      </details>
    </div>
  );
};

export default Home;
