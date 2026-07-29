import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";
import { cachedGet, prefetch } from "../api/requestCache";
import { useAuth } from "../context/AuthContext";

const EventDetail = () => {
  const { orgSlug, eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [organization, setOrganization] = useState(null);
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quantities, setQuantities] = useState({});
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartMessage, setCartMessage] = useState("");
  const [sharePopover, setSharePopover] = useState(false);
  const [shareLinkData, setShareLinkData] = useState(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [infoRes, eventRes] = await Promise.all([
          cachedGet(`/o/${orgSlug}/info`, 60_000),
          cachedGet(`/o/${orgSlug}/events/${eventId}`, 30_000),
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

  // Capture ?ref=CODE from URL and save to sessionStorage for checkout
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) {
      sessionStorage.setItem("referralCode", refCode);
    }
  }, [searchParams]);

  const handleShare = async () => {
    setShareLoading(true);
    try {
      const res = await apiClient.get("/referrals/me");
      const { referralCode } = res.data.data;
      const shareLink = `${window.location.origin}/o/${orgSlug}/events/${eventId}?ref=${referralCode}`;
      setShareLinkData({ referralCode, shareLink });
      setSharePopover(true);
    } catch (err) {
      console.error("Failed to get referral code", err);
    } finally {
      setShareLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareLinkData) return;
    navigator.clipboard.writeText(shareLinkData.shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
        <Link
          to={`/o/${orgSlug}/events/${eventId}/seats`}
          className="btn btn-primary"
          onMouseEnter={() => prefetch(`/o/${orgSlug}/events/${eventId}/seatmap`, 3_000)}
          onFocus={() => prefetch(`/o/${orgSlug}/events/${eventId}/seatmap`, 3_000)}
        >
          Choose seats
        </Link>
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
              to="/cart"
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
                    <div style={styles.price}>$ {Number(ticketType.price || 0)}</div>
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

      {/* Share & Earn Referral Card */}
      <div className="card" style={styles.shareCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "var(--paper)" }}>🎁 Share &amp; Earn 10% Off</p>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
              Share this event with friends. When they buy a ticket, you earn a 10% discount reward on your next purchase.
            </p>
          </div>
          {user ? (
            <button
              style={styles.shareBtn}
              onClick={handleShare}
              disabled={shareLoading}
            >
              {shareLoading ? "Loading..." : "🔗 Get My Share Link"}
            </button>
          ) : (
            <Link to="/login" style={{ ...styles.shareBtn, textDecoration: "none", display: "inline-block" }}>
              Login to Share &amp; Earn
            </Link>
          )}
        </div>

        {/* Share Popover */}
        {sharePopover && shareLinkData && (
          <div style={styles.sharePopover}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <p style={{ margin: 0, fontWeight: 700, color: "var(--paper)" }}>Your Referral Link</p>
              <button onClick={() => setSharePopover(false)} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 18 }}>✕</button>
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)" }}>
              Code: <strong style={{ color: "var(--gold)" }}>{shareLinkData.referralCode}</strong> — share the link below:
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                readOnly
                value={shareLinkData.shareLink}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1px solid #d8d0bd", background: "#fffdf8", color: "#1e2030", fontSize: 13 }}
                onClick={(e) => e.target.select()}
              />
              <button onClick={handleCopyLink} style={styles.copyBtn}>
                {copied ? "✓ Copied!" : "Copy"}
              </button>
            </div>
          </div>
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
  shareCard: {
    marginTop: 20,
    background: "linear-gradient(135deg, rgba(201,154,60,0.08), rgba(25,36,54,0.6))",
    border: "1px solid rgba(201,154,60,0.25)",
  },
  shareBtn: {
    padding: "10px 20px",
    background: "var(--gold)",
    color: "var(--navy)",
    border: "none",
    borderRadius: 10,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  sharePopover: {
    marginTop: 16,
    padding: "16px",
    background: "rgba(25, 36, 54, 0.95)",
    borderRadius: 12,
    border: "1px solid rgba(201,154,60,0.3)",
  },
  copyBtn: {
    padding: "9px 16px",
    background: "var(--gold)",
    color: "var(--navy)",
    border: "none",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
};

export default EventDetail;
