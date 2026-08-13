import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";
import { cachedGet } from "../api/requestCache";
import SeatMapCanvas from "../components/seatmap/SeatMapCanvas";
import { fetchCart, serverLockSeat, serverUnlockSeat } from "../utils/cart";
import "./SeatSelection.css";

const seatKey = (blockId, seatId) => `${blockId}:${seatId}`;

const formatUSD = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);

export default function SeatSelection() {
  const { orgSlug, eventId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("EventSeatMapSessionID") || searchParams.get("sessionId") || "";
  const [map, setMap] = useState(null);
  const [event, setEvent] = useState(null);
  const [cart, setCart] = useState({ items: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    try {
      const [mapResponse, cartItems, eventResponse] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/events/${eventId}/seatmap?EventSeatMapSessionID=${sessionId}`),
        fetchCart(),
        apiClient.get(`/o/${orgSlug}/events/${eventId}?EventSeatMapSessionID=${sessionId}`),
      ]);
      setMap(mapResponse.data.seatmap);
      // Filter cart items only for this event to display in the sidebar
      const eventItems = cartItems.filter(item => String(item.eventId) === String(eventId));
      setCart({ items: eventItems });
      setEvent(eventResponse.data.event);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load this seating plan.");
    }
  }, [orgSlug, eventId, sessionId]);

  useEffect(() => {
    load();
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") load(); };
    const interval = window.setInterval(refreshWhenVisible, 7000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  const selected = useMemo(
    () => new Set(cart.items.map((item) => seatKey(item.blockId, item.seatId))),
    [cart],
  );
  const total = cart.items.reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1),
    0,
  );

  const toggle = async (block, seat) => {
    const exists = selected.has(seatKey(block.id, seat.id));
    if (!exists && seat.status !== "available") return;
    if (busy) return;

    setBusy(true);
    setError("");
    try {
      if (exists) {
        await serverUnlockSeat({ eventId, eventSessionId: sessionId, blockId: block.id, seatId: seat.id });
        showToast("🗑️ Seat removed from cart!");
      } else {
        await serverLockSeat({
          eventId,
          eventSessionId: sessionId,
          blockId: block.id,
          seatId: seat.id,
          seatName: seat.seatName,
          sectionName: block.name,
          category: block.category || null,
          unitPrice: Number(block.price || 0),
        });
        showToast("✨ Seat added to cart!");
      }
      
      // Reload cart items from LocalStorage
      const cartItems = await fetchCart();
      const eventItems = cartItems.filter(item => String(item.eventId) === String(eventId));
      setCart({ items: eventItems });
      
      // Reload map to show updated database status of seat
      const mapResponse = await apiClient.get(`/o/${orgSlug}/events/${eventId}/seatmap?EventSeatMapSessionID=${sessionId}`);
      setMap(mapResponse.data.seatmap);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update your selection.");
    } finally {
      setBusy(false);
    }
  };

  const changeGaQuantity = async (block, increment) => {
    if (busy) return;
    const current = cart.items.filter((item) => item.blockId === block.id);
    const cartSeatIds = new Set(current.map((item) => item.seatId));
    const candidate = increment
      ? block.seats?.find((seat) => seat.status === "available" && !cartSeatIds.has(seat.id))
      : current.at(-1);
    if (!candidate) return;

    setBusy(true);
    setError("");
    try {
      if (increment) {
        await serverLockSeat({
          eventId,
          eventSessionId: sessionId,
          blockId: block.id,
          seatId: candidate.id,
          seatName: candidate.seatName || "GA Ticket",
          sectionName: block.name,
          category: block.category || null,
          unitPrice: Number(block.price || 0),
        });
        showToast("✨ Ticket added to cart!");
      } else {
        await serverUnlockSeat({ eventId, eventSessionId: sessionId, blockId: block.id, seatId: candidate.seatId });
        showToast("🗑️ Ticket removed from cart!");
      }
      
      // Reload cart items
      const cartItems = await fetchCart();
      const eventItems = cartItems.filter(item => String(item.eventId) === String(eventId));
      setCart({ items: eventItems });
      
      // Reload map
      const mapResponse = await apiClient.get(`/o/${orgSlug}/events/${eventId}/seatmap?EventSeatMapSessionID=${sessionId}`);
      setMap(mapResponse.data.seatmap);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update General Admission quantity.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !map) {
    return (
      <div className="ss-loading" style={{ padding: "40px 20px", textAlign: "center" }}>
        <div className="ss-error" style={{ display: "inline-block", margin: "20px auto", maxWidth: 500 }}>
          <span>⚠</span> {error}
        </div>
        <div style={{ marginTop: 20 }}>
          <Link to={`/o/${orgSlug}/events/${eventId}`} className="ss-back" style={{ display: "inline-block" }}>
            ← Back to event
          </Link>
        </div>
      </div>
    );
  }

  if (!map) {
    return (
      <div className="ss-loading">
        <div className="ss-loading__spinner" />
        <p>Loading seating plan…</p>
      </div>
    );
  }

  const individualItems = cart.items.filter(
    (item) => !map.blocks.find((block) => block.id === item.blockId && block.type === "general-admission"),
  );

  const gaBlocks = map.blocks.filter((block) => block.type === "general-admission");
  const hasSelections = cart.items.length > 0;

  return (
    <div className="ss-page">
      {/* ── Back link ── */}
      <Link to={`/o/${orgSlug}/events/${eventId}`} className="ss-back">
        ← Back to event
      </Link>

      <div className="ss-layout">
        {/* ── Left: map area ── */}
        <section className="ss-map-section">
          <div className="ss-heading">
            <p className="ss-eyebrow">SELECT YOUR PLACE</p>
            <h1 className="ss-title">
              {event?.name || "Choose Your Seats"}
            </h1>
            {event?.dateTime && (
              <p className="ss-subtitle">
                {new Date(event.dateTime).toLocaleDateString("en-US", {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
                {event.venueId?.name && ` · ${event.venueId.name}`}
              </p>
            )}
          </div>

          {/* Legend */}
          <div className="ss-legend">
            <span className="ss-legend__dot ss-legend__dot--available" /> Available
            <span className="ss-legend__dot ss-legend__dot--selected" /> Selected
            <span className="ss-legend__dot ss-legend__dot--held" /> Temporarily held
            <span className="ss-legend__dot ss-legend__dot--sold" /> Sold
            <span className="ss-legend__dot ss-legend__dot--organizer" /> Organizer hold
          </div>

          {error && (
            <div className="ss-error">
              <span>⚠</span> {error}
            </div>
          )}

          <div className="ss-canvas-wrap">
            <SeatMapCanvas
              map={map}
              selectedIds={selected}
              onSeatClick={toggle}
              onGaClick={(block) => changeGaQuantity(block, true)}
              className="ss-canvas"
            />
          </div>
        </section>

        {/* ── Right: order summary sidebar ── */}
        <aside className="ss-sidebar">
          <div className="ss-sidebar__inner">
            <div className="ss-sidebar__header">
              <p className="ss-sidebar__label">YOUR ORDER</p>
              {hasSelections && (
                <span className="ss-sidebar__badge">{cart.items.length} seat{cart.items.length !== 1 ? "s" : ""}</span>
              )}
            </div>

            {/* GA blocks */}
            {gaBlocks.length > 0 && (
              <div className="ss-ga-blocks">
                {gaBlocks.map((block) => {
                  const quantity = cart.items.filter((item) => item.blockId === block.id).length;
                  return (
                    <div key={block.id} className="ss-ga-row">
                      <div className="ss-ga-row__info">
                        <p className="ss-ga-row__name">{block.name}</p>
                        <p className="ss-ga-row__price">{formatUSD(block.price || 0)} each</p>
                      </div>
                      <div className="ss-ga-row__counter">
                        <button
                          type="button"
                          onClick={() => changeGaQuantity(block, false)}
                          disabled={!quantity || busy}
                          aria-label={`Remove one ${block.name}`}
                          className="ss-ga-row__btn"
                        >
                          −
                        </button>
                        <span className="ss-ga-row__qty">{quantity}</span>
                        <button
                          type="button"
                          onClick={() => changeGaQuantity(block, true)}
                          disabled={busy}
                          aria-label={`Add one ${block.name}`}
                          className="ss-ga-row__btn"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Individual seat list */}
            <div className="ss-seat-list">
              {!hasSelections ? (
                <div className="ss-empty-state">
                  <div className="ss-empty-state__icon">🎟</div>
                  <p>Click seats on the map to add them here.</p>
                </div>
              ) : (
                <>
                  {individualItems.map((item) => (
                    <div key={seatKey(item.blockId, item.seatId)} className="ss-seat-row">
                      <div className="ss-seat-row__info">
                        <span className="ss-seat-row__name">{item.seatName}</span>
                        <span className="ss-seat-row__section">{item.sectionName}</span>
                      </div>
                      <strong className="ss-seat-row__price">{formatUSD(item.unitPrice)}</strong>
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Total */}
            <div className="ss-total">
              <span>Total</span>
              <strong>{formatUSD(total)}</strong>
            </div>

            {/* Actions */}
            <div className="ss-actions">
              <button
                type="button"
                disabled={!hasSelections || busy}
                onClick={() => navigate("/cart")}
                className="ss-btn ss-btn--primary"
                style={{ width: "100%" }}
              >
                Go to Cart &rarr;
              </button>
            </div>

            <p className="ss-sidebar__note">
              🔒 Selections are held in your cart for 2 days from the first item added.
            </p>
          </div>
        </aside>
      </div>

      {/* Glassmorphic Toast Notification */}
      {toast && (
        <div style={{
          position: "fixed",
          top: "24px",
          right: "24px",
          zIndex: 1000,
          background: "rgba(15, 23, 42, 0.75)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
          color: "#fff",
          padding: "12px 24px",
          borderRadius: "12px",
          fontWeight: 600,
          fontSize: "14px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          animation: "slideIn 0.3s ease"
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
