import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";
import SeatMapCanvas from "../components/seatmap/SeatMapCanvas";
import "./SeatSelection.css";

const seatKey = (blockId, seatId) => `${blockId}:${seatId}`;

export default function BundleSeatSelection() {
  const { orgSlug, bundleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requiredQty = Number(searchParams.get("qty") || 2);

  const [bundle, setBundle] = useState(null);
  const [currentEventIdx, setCurrentEventIdx] = useState(0);
  const [activeEventMap, setActiveEventMap] = useState(null);
  const [activeCart, setActiveCart] = useState({ items: [] });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Private event protection states (Case 3)
  const [lockedEventId, setLockedEventId] = useState(null);
  const [localUnlockedEvents, setLocalUnlockedEvents] = useState({});
  const [unlockCodeInput, setUnlockCodeInput] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);

  const loadBundle = async () => {
    try {
      const res = await apiClient.get(`/o/${orgSlug}/bundles/${bundleId}`);
      setBundle(res.data.bundle);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load bundle details.");
    }
  };

  useEffect(() => {
    loadBundle();
  }, [orgSlug, bundleId]);

  const activeEvent = bundle?.eventIds?.[currentEventIdx];

  const loadActiveEventMapAndCart = async () => {
    if (!activeEvent) return;

    // Check if code was already unlocked in this session
    const saved = JSON.parse(sessionStorage.getItem("unlockedCodes") || "{}");
    const isUnlocked = saved[activeEvent._id] || localUnlockedEvents[activeEvent._id];

    const isLocked = activeEvent.isProtected && !bundle?.accessCode && !isUnlocked;
    if (isLocked) {
      setLockedEventId(activeEvent._id);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [mapRes, cartRes] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/events/${activeEvent._id}/seatmap`),
        apiClient.get(`/o/${orgSlug}/cart/${activeEvent._id}`),
      ]);
      setActiveEventMap(mapRes.data.seatmap);
      setActiveCart(cartRes.data.cart);
      setLockedEventId(null);
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.isProtected) {
        setLockedEventId(activeEvent._id);
      } else {
        setError("Could not load seat map or cart reservation.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActiveEventMapAndCart();
  }, [activeEvent]);

  const handleUnlockEventSubmit = async (e) => {
    e.preventDefault();
    setVerifyingCode(true);
    setUnlockError("");
    try {
      await apiClient.post(`/o/${orgSlug}/events/${activeEvent._id}/verify-access`, {
        accessCode: unlockCodeInput,
      });
      const saved = JSON.parse(sessionStorage.getItem("unlockedCodes") || "{}");
      saved[activeEvent._id] = unlockCodeInput;
      sessionStorage.setItem("unlockedCodes", JSON.stringify(saved));

      setLocalUnlockedEvents((prev) => ({ ...prev, [activeEvent._id]: true }));
      setLockedEventId(null);
      setUnlockCodeInput("");
      
      // Directly reload map and cart after unlocking
      setTimeout(() => {
        loadActiveEventMapAndCart();
      }, 50);
    } catch (err) {
      setUnlockError(err.response?.data?.message || "Invalid access code.");
    } finally {
      setVerifyingCode(false);
    }
  };

  const selectedIds = useMemo(
    () => new Set(activeCart.items.map((item) => seatKey(item.blockId, item.seatId))),
    [activeCart]
  );

  const filteredEventMap = useMemo(() => {
    if (!activeEventMap || !activeEvent || !bundle) return null;
    const restriction = bundle.allowedSections?.find(
      (r) => r.eventId.toString() === activeEvent._id.toString()
    );
    if (!restriction || !restriction.blockId) return activeEventMap;

    return {
      ...activeEventMap,
      blocks: activeEventMap.blocks.filter((b) => b.id === restriction.blockId),
    };
  }, [activeEventMap, activeEvent, bundle]);

  const toggleSeat = async (block, seat) => {
    if (seat.status !== "available" || busy) return;
    setError("");

    const key = seatKey(block.id, seat.id);
    const exists = selectedIds.has(key);

    if (!exists && activeCart.items.length >= requiredQty) {
      setError(`You can only select up to ${requiredQty} seats for this event.`);
      return;
    }

    if (bundle && bundle.allowedSections) {
      const restriction = bundle.allowedSections.find(
        (r) => r.eventId.toString() === activeEvent._id.toString()
      );
      if (restriction && restriction.blockId && restriction.blockId !== block.id) {
        setError(`Only seats in the "${restriction.blockName}" section are allowed for this bundle.`);
        return;
      }
    }

    setBusy(true);
    try {
      const res = exists
        ? await apiClient.delete(`/o/${orgSlug}/cart/${activeEvent._id}/seats/${block.id}/${seat.id}`)
        : await apiClient.post(`/o/${orgSlug}/cart/${activeEvent._id}/items`, {
            blockId: block.id,
            seatId: seat.id,
            overridePrice: bundle.pricePerSeat,
            bundleId: bundle._id,
          });
      setActiveCart(res.data.cart);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update selection.");
    } finally {
      setBusy(false);
    }
  };

  const handleNext = () => {
    if (activeCart.items.length !== requiredQty) {
      setError(`Please select exactly ${requiredQty} seats before continuing.`);
      return;
    }
    setError("");
    setCurrentEventIdx((prev) => prev + 1);
  };

  const handleBack = () => {
    setError("");
    setCurrentEventIdx((prev) => Math.max(0, prev - 1));
  };

  const handleCheckout = () => {
    if (activeCart.items.length !== requiredQty) {
      setError(`Please select exactly ${requiredQty} seats for this event.`);
      return;
    }
    // Gather all reservations across the session carts for checkout redirection.
    // The redirect goes to our checkout form with selections structured by event.
    navigate(`/o/${orgSlug}/checkout/bundle?bundleId=${bundleId}&qty=${requiredQty}`);
  };

  if (!bundle || loading) {
    return (
      <div className="ss-loading">
        <div className="ss-loading__spinner" />
        <p>Loading seating plan…</p>
      </div>
    );
  }

  const isLastEvent = currentEventIdx === (bundle.eventIds?.length || 1) - 1;

  return (
    <div className="ss-page">
      <div className="ss-back" style={{ cursor: "pointer" }} onClick={() => navigate(`/o/${orgSlug}/bundles/${bundleId}`)}>
        ← Back to bundle details
      </div>

      <div className="ss-layout">
        {/* Left: Interactive seat map canvas */}
        <section className="ss-map-section">
          <div className="ss-heading">
            <span className="ss-eyebrow">
              EVENT {currentEventIdx + 1} OF {bundle.eventIds?.length}
            </span>
            <h1 className="ss-title">{activeEvent?.name}</h1>
            <p className="ss-subtitle">
              📅 {new Date(activeEvent?.dateTime).toLocaleDateString()} · {bundle.venueId?.name}
            </p>
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

          {((activeEvent?.isProtected || lockedEventId === activeEvent?._id) && !localUnlockedEvents[activeEvent?._id]) ? (
            <div
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(251, 191, 36, 0.2)",
                borderRadius: 20,
                padding: "48px 24px",
                textAlign: "center",
                maxWidth: 480,
                margin: "40px auto",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              }}
              className="animate-fade-in"
            >
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
              <h2 className="font-display text-2xl" style={{ color: "var(--paper)", margin: "0 0 10px" }}>Protected Seats</h2>
              <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.6, margin: "0 0 24px" }}>
                This event requires a private access code to reveal its seating map and book tickets.
              </p>

              <form onSubmit={handleUnlockEventSubmit} style={{ display: "grid", gap: 12, maxWidth: 320, margin: "0 auto" }}>
                <input
                  type="text"
                  required
                  value={unlockCodeInput}
                  onChange={(e) => setUnlockCodeInput(e.target.value)}
                  placeholder="Enter event access code..."
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-ink-text bg-white"
                  style={{ fontSize: 14 }}
                />
                {unlockError && (
                  <div style={{ padding: "6px 10px", background: "rgba(192, 80, 62, 0.15)", border: "1px solid var(--danger)", borderRadius: 6, fontSize: 12, color: "#ffa0a0", textAlign: "left" }}>
                    ⚠️ {unlockError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={verifyingCode}
                  className="rounded-lg bg-gold px-4 py-2 font-bold text-ink text-sm"
                  style={{ width: "100%" }}
                >
                  {verifyingCode ? "Verifying..." : "Verify & Unlock Seats"}
                </button>
              </form>
            </div>
          ) : (
            filteredEventMap && (
              <div className="ss-canvas-wrap">
                <SeatMapCanvas
                  map={filteredEventMap}
                  selectedIds={selectedIds}
                  onSeatClick={toggleSeat}
                />
              </div>
            )
          )}
        </section>

        {/* Right: progress summary sidebar */}
        <aside className="ss-sidebar">
          <div className="ss-sidebar__inner">
            <div className="ss-sidebar__header">
              <p className="ss-sidebar__label">SELECTION STATUS</p>
              <span className="ss-sidebar__badge">
                {activeCart.items.length} / {requiredQty} selected
              </span>
            </div>

            <div className="ss-seat-list">
              {activeCart.items.length === 0 ? (
                <div className="ss-empty-state">
                  <div className="ss-empty-state__icon">🎟</div>
                  <p>Click seats on the map to add them here.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {activeCart.items.map((item) => (
                    <div key={seatKey(item.blockId, item.seatId)} className="ss-seat-row">
                      <div className="ss-seat-row__info">
                        <span className="ss-seat-row__name">{item.seatName}</span>
                        <span className="ss-seat-row__section">{item.sectionName}</span>
                      </div>
                      {/* Each seat is 1 "slot" — no individual price shown */}
                      <strong className="ss-seat-row__price" style={{ fontSize: 11, color: "var(--muted)" }}>✓ Selected</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>


            <div className="ss-actions">
              {currentEventIdx > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={busy}
                  className="ss-btn ss-btn--secondary"
                >
                  ← Back to Previous Event
                </button>
              )}

              {isLastEvent ? (
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={busy || activeCart.items.length !== requiredQty}
                  className="ss-btn ss-btn--primary"
                  style={{ background: "#c99a3c", color: "#14162b" }}
                >
                  {busy ? "Processing…" : "Proceed to Payment →"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={busy || activeCart.items.length !== requiredQty}
                  className="ss-btn ss-btn--primary"
                  style={{ background: "#c99a3c", color: "#14162b" }}
                >
                  Next Event →
                </button>
              )}
            </div>

            <p className="ss-sidebar__note">
              🔒 Selections are held securely in your cart. You must select exactly {requiredQty} seats for each event to proceed.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
