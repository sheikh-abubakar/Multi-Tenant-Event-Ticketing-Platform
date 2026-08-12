import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";
import { cachedGet, prefetch } from "../api/requestCache";
import { useAuth } from "../context/AuthContext";
import YouTubeEmbed from "../components/YouTubeEmbed";
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
  const [sessions, setSessions] = useState([]);
  const [isBookingOpen, setIsBookingOpen] = useState(true);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!event || !event.bookingOpeningDateTime) {
      setIsBookingOpen(true);
      return;
    }

    const openingTime = new Date(event.bookingOpeningDateTime).getTime();
    
    const updateCountdown = () => {
      const now = Date.now();
      const diff = openingTime - now;

      if (diff <= 0) {
        setIsBookingOpen(true);
      } else {
        setIsBookingOpen(false);
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdown({ days, hours, minutes, seconds });
      }
    };

    updateCountdown(); // run once immediately
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [event]);

  // Protected Event states
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockCodeInput, setUnlockCodeInput] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const savedCodes = JSON.parse(sessionStorage.getItem("unlockedCodes") || "{}");
        const eventCode = savedCodes[eventId] || "";
        const headers = {};
        if (eventCode) {
          headers["x-event-access-code"] = eventCode;
        }

        const [infoRes, eventRes] = await Promise.all([
          cachedGet(`/o/${orgSlug}/info`, 60_000),
          apiClient.get(`/o/${orgSlug}/events/${eventId}`, { headers }),
        ]);
        if (!cancelled) {
          setOrganization(infoRes.data.organization);
          setEvent(eventRes.data.event);
          const upcomingSessions = (eventRes.data.sessions || []).filter(s => new Date(s.dateTime) >= new Date());
          setSessions(upcomingSessions);
          if (upcomingSessions.length === 0) {
            setError("This event is no longer active as all of its session dates have passed.");
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Could not load this event.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [eventId, orgSlug, reloadTrigger]);

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

  const handleUnlockSubmit = async (e) => {
    e.preventDefault();
    setVerifyingCode(true);
    setUnlockError("");
    try {
      await apiClient.post(`/o/${orgSlug}/events/${eventId}/verify-access`, {
        accessCode: unlockCodeInput,
      });
      const savedCodes = JSON.parse(sessionStorage.getItem("unlockedCodes") || "{}");
      savedCodes[eventId] = unlockCodeInput;
      sessionStorage.setItem("unlockedCodes", JSON.stringify(savedCodes));

      setShowUnlockModal(false);
      setUnlockCodeInput("");
      setReloadTrigger((prev) => prev + 1);
    } catch (err) {
      setUnlockError(err.response?.data?.message || "Invalid access code.");
    } finally {
      setVerifyingCode(false);
    }
  };

  const renderUnlockModal = () => (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        className="unlock-modal-card"
        style={{
          width: "100%",
          maxWidth: 420,
          background: "linear-gradient(155deg, #181b35 0%, #111326 100%)",
          border: "1px solid rgba(201, 154, 60, 0.3)",
          borderRadius: 20,
          padding: 28,
          boxShadow: "0 24px 60px rgba(0,0,0,0.7)",
          color: "var(--paper)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 className="font-display text-2xl" style={{ margin: 0, color: "var(--gold)" }}>🔒 Unlock Event</h3>
          <button
            onClick={() => { setShowUnlockModal(false); setUnlockError(""); }}
            style={{ border: "none", background: "transparent", color: "var(--muted)", fontSize: 20, cursor: "pointer" }}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleUnlockSubmit}>
          <label style={{ display: "block", marginBottom: 16, fontSize: 13, fontWeight: 600, color: "var(--paper, #ffffff)" }}>
            Enter Security Code
            <input
              type="text"
              required
              value={unlockCodeInput}
              onChange={(e) => setUnlockCodeInput(e.target.value)}
              placeholder="Private access code..."
              className="w-full mt-2 rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
              style={{ fontSize: 14 }}
              autoFocus
            />
          </label>

          {unlockError && (
            <div style={{ marginBottom: 16, padding: "8px 12px", background: "rgba(192, 80, 62, 0.12)", border: "1px solid var(--danger)", borderRadius: 8, fontSize: 12, color: "#ffa0a0" }}>
              ⚠️ {unlockError}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => { setShowUnlockModal(false); setUnlockError(""); }}
              className="rounded-lg border px-4 py-2 text-sm"
              style={{ background: "transparent", color: "var(--paper)", border: "1px solid rgba(255,255,255,0.15)" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={verifyingCode}
              className="rounded-lg bg-gold px-5 py-2 font-bold text-ink text-sm"
            >
              {verifyingCode ? "Verifying..." : "Verify & Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const selectedSessionId = searchParams.get("sessionId") || (sessions[0]?._id) || "";
  const activeSession = sessions.find(s => String(s._id) === String(selectedSessionId)) || sessions[0] || event;
  const { full: dateStr, time } = formatEventDate(activeSession.dateTime || event.dateTime);

  if (event.isProtected) {
    return (
      <div className="ed-page">
        <Link to={`/o/${orgSlug}/events`} className="ed-back">← Back to events</Link>
        <div className="ed-hero" style={{ filter: "blur(4px)", pointerEvents: "none" }}>
          <div className="ed-hero-banner-wrap">
            {event.bannerImageUrl ? (
              <img src={event.bannerImageUrl} alt={event.name} className="ed-hero-img" />
            ) : (
              <div className="ed-hero-fallback" />
            )}
            <div className="ed-hero-gradient" />
            <div className="ed-hero-overlay-info">
              <h1 className="ed-hero-title">{event.name}</h1>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: -60,
            position: "relative",
            zIndex: 10,
            background: "rgba(20, 22, 43, 0.55)",
            backdropFilter: "blur(16px)",
            border: "1px solid rgba(201, 154, 60, 0.25)",
            borderRadius: 20,
            padding: "48px 32px",
            textAlign: "center",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
            maxWidth: 600,
            margin: "0 auto 40px",
          }}
        >
          {sessions.length > 1 && (
            <div style={{ marginBottom: 24, textAlign: "left" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--gold)", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                Select Session Date
              </label>
              <select
                value={selectedSessionId}
                onChange={(e) => navigate(`/o/${orgSlug}/events/${eventId}?sessionId=${e.target.value}`)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "#14162b",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.15)",
                  fontSize: "14px",
                  fontWeight: 600,
                  outline: "none"
                }}
              >
                {sessions.map((s) => (
                  <option key={s._id} value={s._id}>
                    {new Date(s.dateTime).toLocaleString("en-US", {
                      weekday: "short",
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
          <h2 className="font-display text-3xl" style={{ color: "var(--paper)", margin: "0 0 12px" }}>Protected Event</h2>
          <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
            This is a private event. You must provide a valid security code to unlock the seating layout and purchase tickets.
          </p>
          <button
            onClick={() => setShowUnlockModal(true)}
            className="ed-sm-cta"
            style={{ margin: "0 auto", padding: "12px 32px", fontSize: 15, fontWeight: 700 }}
          >
            🔑 Unlock with Access Code
          </button>
        </div>

        {showUnlockModal && renderUnlockModal()}
      </div>
    );
  }

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

            {/* YouTube promo video */}
            {event.youtubeUrl && (
              <YouTubeEmbed
                youtubeUrl={event.youtubeUrl}
                eventName={event.name}
                description={event.description}
                label="Official Video"
              />
            )}

            {sessions.length > 1 && (
              <div style={{
                background: "rgba(255, 255, 255, 0.05)",
                padding: "16px 20px",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                marginBottom: "24px"
              }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c99a3c", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Select Session Date
                </label>
                <select
                  value={selectedSessionId}
                  onChange={(e) => navigate(`/o/${orgSlug}/events/${eventId}?sessionId=${e.target.value}`)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "#14162b",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.15)",
                    fontSize: "14px",
                    fontWeight: 600,
                    outline: "none"
                  }}
                >
                  {sessions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {new Date(s.dateTime).toLocaleString("en-US", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isBookingOpen ? (
              <>
                <Link
                  to={`/o/${orgSlug}/events/${eventId}/seats?sessionId=${selectedSessionId}`}
                  className="ed-sm-cta"
                  onMouseEnter={() => prefetch(`/o/${orgSlug}/events/${eventId}/seatmap?sessionId=${selectedSessionId}`, 3_000)}
                  onFocus={() => prefetch(`/o/${orgSlug}/events/${eventId}/seatmap?sessionId=${selectedSessionId}`, 3_000)}
                >
                  <span className="ed-sm-cta-icon">🗺️</span>
                  Choose Your Seats
                  <span className="ed-sm-cta-arrow">→</span>
                </Link>

                <p className="ed-sm-hint">
                  Select your preferred seats from the interactive venue map and pay only for what you choose.
                </p>
              </>
            ) : (
              <div className="ed-countdown-panel">
                <h3 className="ed-countdown-title">⏳ Booking Opens In</h3>
                <div className="ed-countdown-grid">
                  <div className="ed-countdown-box">
                    <span className="ed-countdown-num">{countdown.days}</span>
                    <span className="ed-countdown-lbl">Days</span>
                  </div>
                  <div className="ed-countdown-box">
                    <span className="ed-countdown-num">{countdown.hours}</span>
                    <span className="ed-countdown-lbl">Hours</span>
                  </div>
                  <div className="ed-countdown-box">
                    <span className="ed-countdown-num">{countdown.minutes}</span>
                    <span className="ed-countdown-lbl">Mins</span>
                  </div>
                  <div className="ed-countdown-box">
                    <span className="ed-countdown-num">{countdown.seconds}</span>
                    <span className="ed-countdown-lbl">Secs</span>
                  </div>
                </div>
                <p className="ed-countdown-time-text">
                  Bookings will officially open on {new Date(event.bookingOpeningDateTime).toLocaleString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit"
                  })}
                </p>
              </div>
            )}
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

        {/* YouTube promo video — legacy ticket mode */}
        {event.youtubeUrl && (
          <div style={{ padding: "0 0 8px" }}>
            <YouTubeEmbed
              youtubeUrl={event.youtubeUrl}
              eventName={event.name}
              description={event.description}
              label="Official Video"
            />
          </div>
        )}
      </div>

      {/* Ticket panel */}
      <div className="ed-ticket-panel">
        {isBookingOpen ? (
          <>
            {sessions.length > 1 && (
              <div style={{
                background: "rgba(255, 255, 255, 0.05)",
                padding: "16px 20px",
                borderRadius: "12px",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                marginBottom: "24px"
              }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#c99a3c", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  Select Session Date
                </label>
                <select
                  value={eventId}
                  onChange={(e) => navigate(`/o/${orgSlug}/events/${e.target.value}`)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "#14162b",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.15)",
                    fontSize: "14px",
                    fontWeight: 600,
                    outline: "none"
                  }}
                >
                  {sessions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {new Date(s.dateTime).toLocaleString("en-US", {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
          </>
        ) : (
          <div className="ed-countdown-panel" style={{ background: "transparent", border: "none", padding: 0 }}>
            <h3 className="ed-countdown-title">⏳ Booking Opens In</h3>
            <div className="ed-countdown-grid" style={{ justifyContent: "center" }}>
              <div className="ed-countdown-box">
                <span className="ed-countdown-num">{countdown.days}</span>
                <span className="ed-countdown-lbl">Days</span>
              </div>
              <div className="ed-countdown-box">
                <span className="ed-countdown-num">{countdown.hours}</span>
                <span className="ed-countdown-lbl">Hours</span>
              </div>
              <div className="ed-countdown-box">
                <span className="ed-countdown-num">{countdown.minutes}</span>
                <span className="ed-countdown-lbl">Mins</span>
              </div>
              <div className="ed-countdown-box">
                <span className="ed-countdown-num">{countdown.seconds}</span>
                <span className="ed-countdown-lbl">Secs</span>
              </div>
            </div>
            <p className="ed-countdown-time-text">
              Tickets will become available on {new Date(event.bookingOpeningDateTime).toLocaleString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </p>
          </div>
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
