import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { cachedGet, prefetch } from "../api/requestCache";
import apiClient from "../api/client";
import "./PublicEvents.css";

const PublicEvents = () => {
  const { orgSlug } = useParams();
  const [searchParams] = useSearchParams();
  const [organization, setOrganization] = useState(null);
  const [events, setEvents] = useState([]);
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Capture referral code from URL and persist it so it survives navigation
  useEffect(() => {
    const refCode = searchParams.get("ref");
    if (refCode) sessionStorage.setItem("referralCode", refCode);
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [infoRes, eventsRes, bundlesRes] = await Promise.all([
          cachedGet(`/o/${orgSlug}/info`, 60_000),
          cachedGet(`/o/${orgSlug}/events`, 30_000),
          apiClient.get(`/o/${orgSlug}/bundles`).catch(() => ({ data: { bundles: [] } })),
        ]);
        if (!cancelled) {
          setOrganization(infoRes.data.organization);
          setEvents(eventsRes.data.events || []);
          setBundles(bundlesRes.data?.bundles || []);
        }
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || "Could not load public events.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [orgSlug]);

  const getPriceRange = (ticketTypes = []) => {
    if (!ticketTypes.length) return null;
    const prices = ticketTypes.map((t) => Number(t.price || 0));
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? `$${min}` : `$${min} – $${max}`;
  };

  const getTotalRemaining = (ticketTypes = []) =>
    ticketTypes.reduce(
      (sum, t) => sum + Math.max(0, Number(t.quantityTotal || 0) - Number(t.quantityBooked || 0)),
      0
    );

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return {
      day: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
    };
  };

  const hasContent = events.length > 0 || bundles.length > 0;

  return (
    <div className="pe-page">
      {/* ── Header ── */}
      <div className="pe-header">
        <div className="pe-header-left">
          <span className="pe-eyebrow">Public Storefront</span>
          <h1 className="pe-org-name">
            {organization ? organization.name : "Loading…"}
          </h1>
          {organization && <span className="pe-slug">/o/{organization.slug}</span>}
        </div>
        <Link to="/" className="pe-home-btn">← Home</Link>
      </div>

      {/* ── States ── */}
      {loading && (
        <div className="pe-loading-grid">
          {[1, 2, 3].map((i) => <div key={i} className="pe-skeleton-card" />)}
        </div>
      )}
      {error && <div className="pe-error">{error}</div>}
      {!loading && !error && !hasContent && (
        <div className="pe-empty">
          <span className="pe-empty-icon">🎟️</span>
          <p>No upcoming events or bundles yet. Check back soon!</p>
        </div>
      )}

      {/* ── Event & Bundle Grid ── */}
      {!loading && !error && hasContent && (
        <div className="pe-grid">
          {/* Render Bundles first */}
          {bundles.map((bundle) => {
            return (
              <Link
                key={bundle._id}
                to={`/o/${orgSlug}/bundles/${bundle._id}`}
                className="pe-card pe-card--bundle"
                style={{ border: "1px solid rgba(201, 154, 60, 0.25)" }}
              >
                {/* Banner */}
                <div className="pe-card-banner">
                  {bundle.bannerImageUrl ? (
                    <img src={bundle.bannerImageUrl} alt={bundle.name} className="pe-card-img" />
                  ) : (
                    <div className="pe-card-img-fallback" />
                  )}
                  <div className="pe-card-overlay" />

                  {/* Top badges */}
                  <div className="pe-card-top-badges">
                    <span className="pe-badge" style={{ background: "linear-gradient(135deg, #c99a3c 0%, #e5b95f 100%)", color: "#14162b", fontWeight: 800 }}>
                      🎉 Event Bundle
                    </span>
                     <span className="pe-badge pe-badge--price">
                      ${bundle.pricePerSeat} / bundle
                    </span>
                  </div>

                  {/* Date chip (shows count of events instead of single date) */}
                  <div className="pe-card-date-chip">
                    <span className="pe-date-day">📦 Multi-Event</span>
                    <span className="pe-date-time">{bundle.eventIds?.length || 0} events package</span>
                  </div>
                </div>

                {/* Body */}
                <div className="pe-card-body">
                  <h3 className="pe-card-title">{bundle.name}</h3>
                  {bundle.venueId && (
                    <p className="pe-card-venue">
                      📍 {bundle.venueId.name}{bundle.venueId.city ? ` · ${bundle.venueId.city}` : ""}
                    </p>
                  )}
                  {bundle.description && (
                    <p className="pe-card-desc">
                      {bundle.description.length > 90
                        ? `${bundle.description.slice(0, 90)}…`
                        : bundle.description}
                    </p>
                  )}
                  <div className="pe-card-footer">
                    <span className="pe-cta" style={{ color: "#e5b95f" }}>
                      View Bundle Package →
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Render Individual Events */}
          {events.map((event) => {
            const { day, time } = formatDate(event.dateTime);
            const priceRange = getPriceRange(event.ticketTypes);
            const remaining = getTotalRemaining(event.ticketTypes);
            const isSeatmap = event.purchaseMode === "seatmap";
            const isSoldOut = !isSeatmap && event.ticketTypes?.length > 0 && remaining === 0;

            return (
              <Link
                key={event._id}
                to={`/o/${orgSlug}/events/${event._id}`}
                onMouseEnter={() => prefetch(`/o/${orgSlug}/events/${event._id}`, 30_000)}
                onFocus={() => prefetch(`/o/${orgSlug}/events/${event._id}`, 30_000)}
                className={`pe-card ${isSoldOut ? "pe-card--sold-out" : ""}`}
              >
                {/* Banner */}
                <div className="pe-card-banner">
                  {event.bannerImageUrl ? (
                    <img src={event.bannerImageUrl} alt={event.name} className="pe-card-img" />
                  ) : (
                    <div className="pe-card-img-fallback" />
                  )}
                  <div className="pe-card-overlay" />

                  {/* Top badges */}
                  <div className="pe-card-top-badges">
                    {isSeatmap && <span className="pe-badge pe-badge--seat">🪑 Choose Seats</span>}
                    {isSoldOut && <span className="pe-badge pe-badge--sold">Sold Out</span>}
                    {!isSoldOut && priceRange && (
                      <span className="pe-badge pe-badge--price">{priceRange}</span>
                    )}
                  </div>

                  {/* Date chip */}
                  <div className="pe-card-date-chip">
                    <span className="pe-date-day">{day}</span>
                    <span className="pe-date-time">{time}</span>
                  </div>
                </div>

                {/* Body */}
                <div className="pe-card-body">
                  <h3 className="pe-card-title">{event.name}</h3>
                  {event.venueId && (
                    <p className="pe-card-venue">
                      📍 {event.venueId.name}{event.venueId.city ? ` · ${event.venueId.city}` : ""}
                    </p>
                  )}
                  {event.description && (
                    <p className="pe-card-desc">
                      {event.description.length > 90
                        ? `${event.description.slice(0, 90)}…`
                        : event.description}
                    </p>
                  )}
                  <div className="pe-card-footer">
                    <span className="pe-cta">
                      {isSoldOut ? "Sold Out" : isSeatmap ? "Pick Your Seat →" : "Get Tickets →"}
                    </span>
                    {!isSoldOut && !isSeatmap && remaining > 0 && (
                      <span className="pe-remaining">{remaining} left</span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PublicEvents;
