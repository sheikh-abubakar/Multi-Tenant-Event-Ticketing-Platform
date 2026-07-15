import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import apiClient from "../api/client";

const EventDetail = () => {
  const { orgSlug, eventId } = useParams();
  const [organization, setOrganization] = useState(null);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [infoRes, eventRes] = await Promise.all([
          apiClient.get(`/o/${orgSlug}/info`),
          apiClient.get(`/o/${orgSlug}/events/${eventId}`),
        ]);

        if (!cancelled) {
          setOrganization(infoRes.data.organization);
          setEvent(eventRes.data.event);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || "Could not load this event.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, orgSlug]);

  const remainingTickets = (ticketTypes = []) =>
    ticketTypes.reduce(
      (sum, ticketType) =>
        sum + Math.max(0, Number(ticketType.quantityTotal || 0) - Number(ticketType.quantityBooked || 0)),
      0
    );

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading event…</p>;

  if (error) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <p style={{ marginTop: 0 }}>
          <Link to={`/o/${orgSlug}/events`}>&larr; Back to events</Link>
        </p>
        <h3 style={{ marginTop: 0, color: "var(--danger)" }}>Could not load event</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!event) return null;

  const totalRemaining = remainingTickets(event.ticketTypes);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link to={`/o/${orgSlug}/events`}>&larr; Back to events</Link>
      </p>

      <div style={styles.topBar}>
        <div>
          <p style={styles.kicker}>Public event detail</p>
          <h1 style={{ color: "var(--paper)", margin: "4px 0 0" }}>{organization?.name || "Event"}</h1>
          {organization && <p style={styles.slug}>/o/{organization.slug}</p>}
        </div>
        <span className="badge">{totalRemaining} remaining</span>
      </div>

      <div className="card" style={styles.heroCard}>
        {event.bannerImageUrl ? (
          <img src={event.bannerImageUrl} alt="" style={styles.heroImage} />
        ) : (
          <div style={styles.heroFallback} />
        )}

        <div style={styles.heroBody}>
          <div style={styles.badges}>
            <span className="badge">Public listing</span>
            <span className="badge">{new Date(event.dateTime).toLocaleString()}</span>
            <span className="badge">{event.venueId?.name || "Venue not set"}</span>
          </div>

          <h2 style={styles.title}>{event.name}</h2>
          <p style={styles.meta}>
            {event.venueId?.name}
            {event.venueId?.city ? ` · ${event.venueId.city}` : ""}
          </p>
          <p style={styles.description}>
            {event.description || "No description provided by the organizer yet."}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3 style={{ marginTop: 0 }}>Ticket types</h3>
        {event.ticketTypes?.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {event.ticketTypes.map((ticketType) => {
              const remaining = Math.max(
                0,
                Number(ticketType.quantityTotal || 0) - Number(ticketType.quantityBooked || 0)
              );

              return (
                <div key={ticketType._id || ticketType.name} style={styles.ticketRow}>
                  <div>
                    <h4 style={{ margin: "0 0 4px", color: "var(--paper)" }}>{ticketType.name}</h4>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
                      {ticketType.quantityBooked || 0} booked of {ticketType.quantityTotal}
                    </p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={styles.price}>Rs. {Number(ticketType.price || 0)}</div>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 14 }}>
                      {remaining} left
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "var(--muted)" }}>No ticket types are available for this event yet.</p>
        )}
      </div>
    </div>
  );
};

const styles = {
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 20,
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
  heroCard: {
    overflow: "hidden",
    padding: 0,
  },
  heroImage: {
    width: "100%",
    height: 340,
    objectFit: "cover",
    display: "block",
  },
  heroFallback: {
    width: "100%",
    height: 340,
    background:
      "linear-gradient(135deg, rgba(231, 168, 73, 0.35), rgba(25, 36, 54, 0.95))",
  },
  heroBody: {
    padding: 20,
  },
  badges: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  title: {
    margin: "0 0 8px",
    color: "var(--paper)",
    fontSize: 32,
  },
  meta: {
    margin: "0 0 10px",
    color: "var(--muted)",
  },
  description: {
    margin: 0,
    lineHeight: 1.6,
  },
  ticketRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    background: "rgba(247, 242, 231, 0.04)",
    border: "1px solid rgba(247, 242, 231, 0.08)",
  },
  price: {
    color: "var(--paper)",
    fontWeight: 700,
    fontSize: 18,
  },
};

export default EventDetail;