import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import apiClient from "../api/client";

const EventDetail = () => {
  const { orgSlug, eventId } = useParams();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState(null);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantities, setQuantities] = useState({});
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartMessage, setCartMessage] = useState("");

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

  if (event.purchaseMode === "seatmap") {
    return (
      <div className="card event-seatmap-hero" style={{ maxWidth: 780, margin: "0 auto" }}>
        <p><Link to={`/o/${orgSlug}/events`}>&larr; Back to events</Link></p>
        {event.bannerImageUrl && <img src={event.bannerImageUrl} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 10 }} />}
        <h1>{event.name}</h1><p style={{ color: "var(--muted)" }}>{new Date(event.dateTime).toLocaleString()} · {event.venueId?.name}</p>
        <p>{event.description || "Choose your exact seats from the interactive seating plan."}</p>
        <Link to={`/o/${orgSlug}/events/${eventId}/seats`} className="btn btn-primary">Choose seats</Link>
      </div>
    );
  }

  const totalRemaining = remainingTickets(event.ticketTypes);

  return (
    <div className="event-detail-page" style={{ maxWidth: 980, margin: "0 auto" }}>
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

      <div className="card event-hero-card" style={styles.heroCard}>
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

      <div className="card event-pricing-panel" style={{ marginTop: 20 }}>
        <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 0 }}>
          <span>Ticket types</span>
          {event.ticketTypes?.length > 0 && (
            <Link
              to={`/o/${orgSlug}/cart/${eventId}`}
              className="badge"
              style={{ textDecoration: "none" }}
            >
              View Cart
            </Link>
          )}
        </h3>

        {cartMessage && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              marginBottom: 12,
              background: cartMessage.includes("Error")
                ? "rgba(220, 38, 38, 0.1)"
                : "rgba(22, 163, 74, 0.1)",
              color: cartMessage.includes("Error") ? "var(--danger)" : "#16a34a",
              fontSize: 14,
            }}
          >
            {cartMessage}
          </div>
        )}

        {event.ticketTypes?.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {event.ticketTypes.map((ticketType, index) => {
              const remaining = Math.max(
                0,
                Number(ticketType.quantityTotal || 0) - Number(ticketType.quantityBooked || 0)
              );

              return (
                <div key={ticketType._id || ticketType.name} className="event-ticket-row" style={styles.ticketRow}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: "0 0 4px", color: "var(--paper)" }}>{ticketType.name}</h4>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
                      {ticketType.quantityBooked || 0} booked of {ticketType.quantityTotal}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", minWidth: 120 }}>
                    <div style={styles.price}>Rs. {Number(ticketType.price || 0)}</div>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 14 }}>
                      {remaining} left
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="number"
                      min={0}
                      max={remaining}
                      value={quantities[index] || 0}
                      onChange={(e) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [index]: Math.max(0, Math.min(remaining, Number(e.target.value))),
                        }))
                      }
                      style={{
                        width: 56,
                        padding: "8px 6px",
                        borderRadius: 8,
                        border: "1px solid #d8d0bd",
                        background: "#fffdf8",
                        color: "#1e2030",
                        textAlign: "center",
                        fontSize: 14,
                      }}
                    />
                    <button
                      style={styles.addBtn}
                      onClick={async () => {
                        const qty = Number(quantities[index] || 0);
                        if (qty < 1) return;

                        setAddingToCart(true);
                        setCartMessage("");
                        try {
                          await apiClient.post(`/o/${orgSlug}/cart/${eventId}/items`, {
                            ticketTypeIndex: index,
                            quantity: qty,
                          });
                          setCartMessage(`Added ${qty} x ${ticketType.name} to cart!`);
                          setQuantities((prev) => ({ ...prev, [index]: 0 }));
                        } catch (err) {
                          setCartMessage(
                            `Error: ${err.response?.data?.message || "Could not add to cart"}`
                          );
                        } finally {
                          setAddingToCart(false);
                        }
                      }}
                      disabled={addingToCart || !(quantities[index] > 0)}
                    >
                      Add
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ color: "var(--muted)" }}>No ticket types are available for this event yet.</p>
        )}
      </div>

      {/* Proceed to Cart button bottom */}
      {event.ticketTypes?.length > 0 && (
        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button
            style={styles.goToCartBtn}
            onClick={() => navigate(`/o/${orgSlug}/cart/${eventId}`)}
          >
            Go to Cart →
          </button>
        </div>
      )}
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
    gap: 12,
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    background: "rgba(247, 242, 231, 0.04)",
    border: "1px solid rgba(247, 242, 231, 0.08)",
  },
  addBtn: {
    padding: "8px 14px",
    background: "var(--gold)",
    color: "var(--navy)",
    border: "none",
    borderRadius: 8,
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  goToCartBtn: {
    padding: "12px 28px",
    background: "var(--gold)",
    color: "var(--navy)",
    border: "none",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
  },
  price: {
    color: "var(--paper)",
    fontWeight: 700,
    fontSize: 18,
  },
};

export default EventDetail;
