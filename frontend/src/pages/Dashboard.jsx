import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "react-router-dom";
import { MapPin, CalendarDays, Store, Users, BarChart3, Settings, ArrowLeft } from "lucide-react";
import apiClient from "../api/client";

/**
 * Checks a permissions[] array for an exact match, a global "*"
 * wildcard, or a resource-level wildcard ("settings:*"). Falls back
 * gracefully to `null` if permissions aren't available yet, so
 * callers can fall back to role-based logic instead.
 */
const hasPerm = (permissions, needed) => {
  if (!permissions) return null;
  const [resource] = needed.split(":");
  return (
    permissions.includes("*") ||
    permissions.includes(`${resource}:*`) ||
    permissions.includes(needed)
  );
};

const SkeletonCard = () => (
  <div className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] p-6">
    <div className="mb-4 h-10 w-10 rounded-xl bg-white/10" />
    <div className="mb-2 h-4 w-24 rounded bg-white/10" />
    <div className="h-3 w-36 rounded bg-white/5" />
  </div>
);

const GlassCard = ({ to, Icon, title, description }) => (
  <Link
    to={to}
    className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-gold/40 hover:bg-white/[0.07] hover:shadow-2xl"
  >
    <div className="mb-4 inline-flex rounded-xl bg-gold/10 p-3 text-gold transition-colors group-hover:bg-gold/20">
      <Icon size={20} strokeWidth={2} />
    </div>
    <h3 className="font-display text-xl tracking-wide text-paper">{title}</h3>
    <p className="mt-1 text-sm text-muted">{description}</p>
  </Link>
);

const Dashboard = () => {
  const { orgSlug } = useParams();
  const location = useLocation();

  // Instant paint: if we arrived here via an OrgCard click, the org
  // name + role were already known on the Home page and passed along
  // via navigation state — no need to wait on a network round-trip
  // just to show the header.
  const initial = location.state || null;

  const [context, setContext] = useState(
    initial ? { organization: initial.organization, membership: { role: initial.role } } : null,
  );
  const [permissions, setPermissions] = useState(null);
  const [error, setError] = useState("");
  const [loadingCards, setLoadingCards] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setError("");
      try {
        const { data } = await apiClient.get(`/o/${orgSlug}/whoami`);
        if (cancelled) return;
        setContext(data);
        setPermissions(data.membership.permissions || null);
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || "Could not load this organization.");
        }
      } finally {
        if (!cancelled) setLoadingCards(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  if (error) {
    return (
      <div className="rounded-xl bg-paper p-6 text-ink-text shadow-lg max-w-md">
        <h3 className="mt-0 font-semibold text-danger">Access denied</h3>
        <p>{error}</p>
      </div>
    );
  }

  const role = context?.membership?.role;
  const canSeeSettingsAndAnalytics =
    hasPerm(permissions, "settings:read") ?? (role === "owner" || role === "admin");

  return (
    <div>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gold-soft hover:underline"
      >
        <ArrowLeft size={15} /> Back to home
      </Link>

      {context ? (
        <>
          <div className="mb-1 flex items-baseline gap-3">
            <h1 className="font-display text-4xl text-paper">{context.organization.name}</h1>
            <span className="badge">{role}</span>
          </div>
          <p className="mb-8 font-mono text-sm text-muted">/o/{context.organization.slug}</p>
        </>
      ) : (
        <div className="mb-8 animate-pulse">
          <div className="mb-2 h-9 w-56 rounded bg-white/10" />
          <div className="h-4 w-32 rounded bg-white/5" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loadingCards ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <GlassCard
              to={`/o/${orgSlug}/manage/venues`}
              Icon={MapPin}
              title="Venues"
              description="Manage the places your events happen"
            />
            <GlassCard
              to={`/o/${orgSlug}/manage/events`}
              Icon={CalendarDays}
              title="Events"
              description="Create and manage events, tickets & banners"
            />
            <GlassCard
              to={`/o/${orgSlug}/events`}
              Icon={Store}
              title="Public storefront"
              description="Preview what buyers see — no login needed"
            />
            <GlassCard
              to={`/o/${orgSlug}/manage/team`}
              Icon={Users}
              title="Team"
              description="Invite members, manage roles & access"
            />
            {canSeeSettingsAndAnalytics && (
              <GlassCard
                to={`/o/${orgSlug}/manage/analytics`}
                Icon={BarChart3}
                title="Analytics"
                description="Bookings, revenue & performance"
              />
            )}
            {canSeeSettingsAndAnalytics && (
              <GlassCard
                to={`/o/${orgSlug}/manage/settings`}
                Icon={Settings}
                title="Settings"
                description="Organization name, slug, logo & delete"
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Dashboard;