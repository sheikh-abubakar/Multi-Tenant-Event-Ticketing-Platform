import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import apiClient from "../api/client";
import { hasPermission } from "../utils/permissionsClient";

/**
 * This page mirrors the backend pipeline on the frontend: it calls
 * /whoami for the current :orgSlug, which only succeeds if the
 * logged-in user is actually a member of this org (loadMembership
 * middleware) — otherwise the backend returns 403 and we show that
 * as an access-denied state instead of a broken dashboard.
 */
const Dashboard = () => {
  const { orgSlug } = useParams();
  const [context, setContext] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const { data } = await apiClient.get(`/o/${orgSlug}/whoami`);
        if (!cancelled) setContext(data);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || "Could not load this organization.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  if (error) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0, color: "var(--danger)" }}>Access denied</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <h1 style={{ color: "var(--paper)", margin: 0 }}>{context.organization.name}</h1>
        <span className="badge">{context.membership.role}</span>
      </div>
      <p style={{ color: "var(--muted)", marginBottom: 32 }}>/o/{context.organization.slug}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
        <Link to={`/o/${orgSlug}/manage/venues`} className="card" style={cardLinkStyle}>
          <h3 style={{ margin: 0 }}>Venues</h3>
          <p style={{ color: "var(--muted)", fontSize: 14, margin: "8px 0 0" }}>
            Manage the places your events happen
          </p>
        </Link>
        <Link to={`/o/${orgSlug}/manage/events`} className="card" style={cardLinkStyle}>
          <h3 style={{ margin: 0 }}>Events</h3>
          <p style={{ color: "var(--muted)", fontSize: 14, margin: "8px 0 0" }}>
            Create and manage events, tickets & banners
          </p>
        </Link>
        <Link to={`/o/${orgSlug}/events`} className="card" style={cardLinkStyle}>
          <h3 style={{ margin: 0 }}>Public storefront</h3>
          <p style={{ color: "var(--muted)", fontSize: 14, margin: "8px 0 0" }}>
            Preview what buyers see — no login needed
          </p>
        </Link>
        <Link to={`/o/${orgSlug}/manage/team`} className="card" style={cardLinkStyle}>
          <h3 style={{ margin: 0 }}>Team</h3>
          <p style={{ color: "var(--muted)", fontSize: 14, margin: "8px 0 0" }}>
            Invite members, manage roles & access
          </p>
        </Link>
        {hasPermission("settings:read", context.membership.permissions) && (
          <Link to={`/o/${orgSlug}/manage/analytics`} className="card" style={cardLinkStyle}>
            <h3 style={{ margin: 0 }}>Analytics</h3>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "8px 0 0" }}>
              Bookings, revenue & performance
            </p>
          </Link>
        )}
        {hasPermission("settings:read", context.membership.permissions) && (
          <Link to={`/o/${orgSlug}/manage/settings`} className="card" style={cardLinkStyle}>
            <h3 style={{ margin: 0 }}>Settings</h3>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "8px 0 0" }}>
              Organization name, slug, logo & delete
            </p>
          </Link>
        )}
      </div>
    </div>
  );
};

const cardLinkStyle = {
  display: "block",
  textDecoration: "none",
  color: "var(--text)",
};

export default Dashboard;