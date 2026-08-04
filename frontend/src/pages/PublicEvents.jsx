import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { cachedGet, prefetch } from "../api/requestCache";
import "./PublicEvents.css";

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
          cachedGet(`/o/${orgSlug}/info`, 60_000),
          cachedGet(`/o/${orgSlug}/events`, 30_000),
        ]);
        if (!cancelled) {
          setOrganization(infoRes.data.organization);
          setEvents(eventsRes.data.events || []);
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
      {!loading && !error && events.length === 0 && (
        <div className="pe-empty">
          <span className="pe-empty-icon">🎟️</span>
          <p>No upcoming events yet. Check back soon!</p>
        </div>
      )}

      {/* ── Event Grid ── */}
      {!loading && !error && events.length > 0 && (
        <div className="pe-grid">
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
