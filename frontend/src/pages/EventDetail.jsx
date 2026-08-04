import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";
import { cachedGet, prefetch } from "../api/requestCache";
import { useAuth } from "../context/AuthContext";
import "./EventDetail.css";

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
        if (!cancelled) setError(err.response?.data?.message || "Could not load this event.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [eventId, orgSlug]);

  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) sessionStorage.setItem("referralCode", refCode);
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
      (sum, t) => sum + Math.max(0, Number(t.quantityTotal || 0) - Number(t.quantityBooked || 0)),
      0
    );

  const formatEventDate = (dateStr) => {
    const d = new Date(dateStr);
    return {
      full: d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };
  };

  // ── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="ed-loading">
        <div className="ed-skeleton-banner" />
        <div className="ed-skeleton-body">
          <div className="ed-skeleton-line w-40" />
          <div className="ed-skeleton-line w-70" />
          <div className="ed-skeleton-line w-55" />
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="ed-error-wrap">
        <Link to={`/o/${orgSlug}/events`} className="ed-back">← Back to events</Link>
        <div className="ed-error-box">
          <span>⚠️</span>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!event) return null;

  const { full: dateStr, time } = formatEventDate(event.dateTime);

  // ── Seatmap mode ─────────────────────────────────────────────────────
  if (event.purchaseMode === "seatmap") {
    return (
      <div className="ed-seatmap-page">
        <Link to={`/o/${orgSlug}/events`} className="ed-back">← Back to events</Link>

        <div className="ed-seatmap-hero">
          {/* Banner with cinematic gradient */}
          <div className="ed-sm-banner-wrap">
            {event.bannerImageUrl ? (
              <img src={event.bannerImageUrl} alt={event.name} className="ed-sm-banner-img" />
            ) : (
              <div className="ed-sm-banner-fallback" />
            )}
            <div className="ed-sm-banner-gradient" />
          </div>

          {/* Content card floating over the gradient */}
          <div className="ed-sm-content">
            <div className="ed-sm-badges">
              <span className="ed-sm-badge ed-sm-badge--seat">🪑 Interactive Seating</span>
              <span className="ed-sm-badge ed-sm-badge--live">Live Map</span>
            </div>

            <h1 className="ed-sm-title">{event.name}</h1>

            <div className="ed-sm-meta-row">
              <div className="ed-sm-meta-item">
                <span className="ed-sm-meta-icon">📅</span>
                <div>
                  <p className="ed-sm-meta-label">Date</p>
                  <p className="ed-sm-meta-val">{dateStr}</p>
                </div>
              </div>
              <div className="ed-sm-meta-item">
                <span className="ed-sm-meta-icon">⏰</span>
                <div>
                  <p className="ed-sm-meta-label">Time</p>
                  <p className="ed-sm-meta-val">{time}</p>
                </div>
              </div>
              {event.venueId && (
                <div className="ed-sm-meta-item">
                  <span className="ed-sm-meta-icon">📍</span>
                  <div>
                    <p className="ed-sm-meta-label">Venue</p>
                    <p className="ed-sm-meta-val">{event.venueId.name}{event.venueId.city ? `, ${event.venueId.city}` : ""}</p>
                  </div>
                </div>
              )}
            </div>

            {event.description && (
              <p className="ed-sm-desc">{event.description}</p>
            )}

            <Link
              to={`/o/${orgSlug}/events/${eventId}/seats`}
              className="ed-sm-cta"
              onMouseEnter={() => prefetch(`/o/${orgSlug}/events/${eventId}/seatmap`, 3_000)}
              onFocus={() => prefetch(`/o/${orgSlug}/events/${eventId}/seatmap`, 3_000)}
            >
              <span className="ed-sm-cta-icon">🗺️</span>
              Choose Your Seats
              <span className="ed-sm-cta-arrow">→</span>
            </Link>

            <p className="ed-sm-hint">
              Select your preferred seats from the interactive venue map and pay only for what you choose.
            </p>
          </div>
        </div>

        {/* Share Card */}
        <ShareCard
          user={user}
          shareLoading={shareLoading}
          sharePopover={sharePopover}
          shareLinkData={shareLinkData}
          copied={copied}
          onShare={handleShare}
          onCopy={handleCopyLink}
          onClose={() => setSharePopover(false)}
        />
      </div>
    );
  }

  // ── Standard ticket purchase mode ────────────────────────────────────
  const totalRemaining = remainingTickets(event.ticketTypes);

  return (
    <div className="ed-page">
      <Link to={`/o/${orgSlug}/events`} className="ed-back">← Back to events</Link>

      {/* Hero */}
      <div className="ed-hero">
        <div className="ed-hero-banner-wrap">
          {event.bannerImageUrl ? (
            <img src={event.bannerImageUrl} alt={event.name} className="ed-hero-img" />
          ) : (
            <div className="ed-hero-fallback" />
          )}
          <div className="ed-hero-gradient" />

          {/* Info overlaid on the banner bottom */}
          <div className="ed-hero-overlay-info">
            <div className="ed-hero-badges">
              <span className="ed-hero-badge">{dateStr} · {time}</span>
              {event.venueId && <span className="ed-hero-badge">📍 {event.venueId.name}{event.venueId.city ? `, ${event.venueId.city}` : ""}</span>}
              {totalRemaining > 0 && <span className="ed-hero-badge ed-hero-badge--tickets">{totalRemaining} tickets left</span>}
            </div>
            <h1 className="ed-hero-title">{event.name}</h1>
          </div>
        </div>

        {event.description && (
          <div className="ed-hero-desc-wrap">
            <p className="ed-hero-desc">{event.description}</p>
          </div>
        )}
      </div>

      {/* Ticket panel */}
      <div className="ed-ticket-panel">
        <div className="ed-ticket-panel-header">
          <h2 className="ed-ticket-panel-title">🎟️ Select Tickets</h2>
          {event.ticketTypes?.length > 0 && (
            <Link to="/cart" className="ed-view-cart-btn">View Cart</Link>
          )}
        </div>

        {cartMessage && (
          <div className={`ed-cart-msg ${cartMessage.includes("Error") ? "ed-cart-msg--error" : "ed-cart-msg--success"}`}>
            {cartMessage}
          </div>
        )}

        {event.ticketTypes?.length ? (
          <div className="ed-tickets-list">
            {event.ticketTypes.map((ticketType, index) => {
              const remaining = Math.max(0,
                Number(ticketType.quantityTotal || 0) - Number(ticketType.quantityBooked || 0)
              );
              const soldOut = remaining === 0;
              const fillPct = ticketType.quantityTotal > 0
                ? Math.round((ticketType.quantityBooked / ticketType.quantityTotal) * 100)
                : 0;

              return (
                <div key={ticketType._id || ticketType.name} className={`ed-ticket-row ${soldOut ? "ed-ticket-row--sold" : ""}`}>
                  <div className="ed-ticket-info">
                    <h4 className="ed-ticket-name">{ticketType.name}</h4>
                    <div className="ed-ticket-fill-bar">
                      <div className="ed-ticket-fill-track">
                        <div className="ed-ticket-fill-fill" style={{ width: `${fillPct}%` }} />
                      </div>
                      <span className="ed-ticket-fill-label">{remaining} remaining</span>
                    </div>
                  </div>

                  <div className="ed-ticket-price-col">
                    <span className="ed-ticket-price">${Number(ticketType.price || 0)}</span>
                    <span className="ed-ticket-per">per ticket</span>
                  </div>

                  <div className="ed-ticket-actions">
                    {soldOut ? (
                      <span className="ed-ticket-sold-badge">Sold Out</span>
                    ) : (
                      <>
                        <div className="ed-qty-stepper">
                          <button
                            className="ed-qty-btn"
                            onClick={() => setQuantities((prev) => ({ ...prev, [index]: Math.max(0, (prev[index] || 0) - 1) }))}
                          >−</button>
                          <span className="ed-qty-val">{quantities[index] || 0}</span>
                          <button
                            className="ed-qty-btn"
                            onClick={() => setQuantities((prev) => ({ ...prev, [index]: Math.min(remaining, (prev[index] || 0) + 1) }))}
                          >+</button>
                        </div>
                        <button
                          className="ed-add-btn"
                          disabled={addingToCart || !(quantities[index] > 0)}
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
                              setCartMessage(`Added ${qty} × ${ticketType.name} to cart!`);
                              setQuantities((prev) => ({ ...prev, [index]: 0 }));
                            } catch (err) {
                              setCartMessage(`Error: ${err.response?.data?.message || "Could not add to cart"}`);
                            } finally {
                              setAddingToCart(false);
                            }
                          }}
                        >
                          {addingToCart ? "…" : "Add"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="ed-no-tickets">No ticket types are available for this event yet.</p>
        )}

        {event.ticketTypes?.length > 0 && (
          <button className="ed-go-cart-btn" onClick={() => navigate(`/o/${orgSlug}/cart/${eventId}`)}>
            Proceed to Cart →
          </button>
        )}
      </div>

      {/* Share Card */}
      <ShareCard
        user={user}
        shareLoading={shareLoading}
        sharePopover={sharePopover}
        shareLinkData={shareLinkData}
        copied={copied}
        onShare={handleShare}
        onCopy={handleCopyLink}
        onClose={() => setSharePopover(false)}
      />
    </div>
  );
};

/* ── Share & Earn Card (reused in both modes) ─────────────────────── */
const ShareCard = ({ user, shareLoading, sharePopover, shareLinkData, copied, onShare, onCopy, onClose }) => (
  <div className="ed-share-card">
    <div className="ed-share-row">
      <div>
        <p className="ed-share-title">🎁 Share &amp; Earn 10% Off</p>
        <p className="ed-share-sub">
          Share this event. When a friend buys a ticket, you earn a 10% discount on your next purchase.
        </p>
      </div>
      {user ? (
        <button className="ed-share-btn" onClick={onShare} disabled={shareLoading}>
          {shareLoading ? "Loading…" : "🔗 Get My Link"}
        </button>
      ) : (
        <Link to="/login" className="ed-share-btn" style={{ textDecoration: "none" }}>
          Login to Share &amp; Earn
        </Link>
      )}
    </div>

    {sharePopover && shareLinkData && (
      <div className="ed-share-popover">
        <div className="ed-share-pop-header">
          <p className="ed-share-pop-title">Your Referral Link</p>
          <button onClick={onClose} className="ed-share-pop-close">✕</button>
        </div>
        <p className="ed-share-pop-code">
          Code: <strong>{shareLinkData.referralCode}</strong>
        </p>
        <div className="ed-share-pop-input-row">
          <input readOnly value={shareLinkData.shareLink} className="ed-share-pop-input" onClick={(e) => e.target.select()} />
          <button onClick={onCopy} className="ed-share-pop-copy">{copied ? "✓ Copied!" : "Copy"}</button>
        </div>
      </div>
    )}
  </div>
);

export default EventDetail;
