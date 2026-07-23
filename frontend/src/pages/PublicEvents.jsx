import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../api/client";

const PublicEvents = () => {
  const { orgSlug } = useParams();
  const [organization, setOrganization] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [infoRes, eventsRes] = await Promise.all([
          apiClient.get(`/o/${orgSlug}/info`),
          apiClient.get(`/o/${orgSlug}/events`),
        ]);

        if (!cancelled) {
          setOrganization(infoRes.data.organization);
          setEvents(eventsRes.data.events || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || "Could not load public events.");
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

  const remainingTickets = (ticketTypes = []) =>
    ticketTypes.reduce(
      (sum, ticketType) =>
        sum + Math.max(0, Number(ticketType.quantityTotal || 0) - Number(ticketType.quantityBooked || 0)),
      0
    );

  return (
    <div className="storefront-page">
      <div className="storefront-header" style={styles.header}>
        <div>
          <p style={styles.kicker}>Public storefront</p>
          <h1 style={{ color: "var(--paper)", margin: "4px 0 0" }}>
            {organization ? organization.name : "Loading organization…"}
          </h1>
          {organization && <p style={styles.slug}>/o/{organization.slug}</p>}
        </div>
        <Link
          to="/"
          className="btn btn-ghost"
          style={{ color: "var(--paper)", borderColor: "rgba(247,242,231,0.35)" }}
        >
          Home
        </Link>
      </div>

      {loading && <p style={{ color: "var(--muted)" }}>Loading events…</p>}
      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && events.length === 0 && (
        <div className="card">No public events yet.</div>
      )}

      <div style={styles.grid}>
        {events.map((event) => {
          const previewDescription = event.description
            ? `${event.description.slice(0, 120)}${event.description.length > 120 ? "..." : ""}`
            : "No description provided.";

          return (
            <Link
              key={event._id}
              to={`/o/${orgSlug}/events/${event._id}`}
              className="card storefront-event-card"
              style={styles.card}
            >
              {event.bannerImageUrl ? (
                <img src={event.bannerImageUrl} alt="" style={styles.banner} />
              ) : (
                <div style={styles.bannerFallback} />
              )}

              <div style={styles.body}>
                <p style={styles.meta}>{new Date(event.dateTime).toLocaleString()}</p>
                <h3 style={styles.title}>{event.name}</h3>
                <p style={styles.meta}>
                  {event.venueId?.name}
                  {event.venueId?.city ? ` · ${event.venueId.city}` : ""}
                </p>
                <p style={styles.description}>{previewDescription}</p>
                <div style={styles.badges}>
                  <span className="badge">{event.ticketTypes?.length || 0} ticket types</span>
                  <span className="badge">{remainingTickets(event.ticketTypes)} remaining</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

const styles = {
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 28,
  },
  kicker: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: 12,
    color: "var(--muted)",
  },
  slug: {
    margin: "8px 0 0",
    color: "var(--muted)",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: 18,
  },
  card: {
    display: "block",
    textDecoration: "none",
    color: "var(--text)",
    overflow: "hidden",
    padding: 0,
  },
  banner: {
    width: "100%",
    height: 180,
    objectFit: "cover",
    display: "block",
  },
  bannerFallback: {
    width: "100%",
    height: 180,
    background:
      "linear-gradient(135deg, rgba(231, 168, 73, 0.35), rgba(25, 36, 54, 0.9))",
  },
  body: {
    padding: 16,
  },
  meta: {
    margin: "0 0 6px",
    color: "var(--muted)",
    fontSize: 13,
  },
  title: {
    margin: "0 0 6px",
    color: "var(--paper)",
  },
  description: {
    margin: "8px 0 12px",
    color: "var(--text)",
    fontSize: 14,
    lineHeight: 1.5,
    minHeight: 42,
  },
  badges: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
};

export default PublicEvents;
