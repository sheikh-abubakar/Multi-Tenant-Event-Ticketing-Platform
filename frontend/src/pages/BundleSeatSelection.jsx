import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";
import SeatMapCanvas from "../components/seatmap/SeatMapCanvas";
import { fetchCart, getCartId, serverLockSeat, serverUnlockSeat, setLocalCart } from "../utils/cart";
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
  const [selectedSessionIds, setSelectedSessionIds] = useState({});
  const [activeEventSessions, setActiveEventSessions] = useState([]);
  const [resolvedEvent, setResolvedEvent] = useState(null);

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

  useEffect(() => {
    setResolvedEvent(null);
  }, [currentEventIdx]);

  const activeEvent = bundle?.eventIds?.[currentEventIdx];
  const displayEvent = resolvedEvent || activeEvent;

  const loadActiveEventMapAndCart = async () => {
    if (!activeEvent) return;

    const resolvedEventId = activeEvent._id;
    const sessionId = selectedSessionIds[activeEvent._id] || "";

    // Check if code was already unlocked in this session
    const saved = JSON.parse(sessionStorage.getItem("unlockedCodes") || "{}");
    const isUnlocked = saved[resolvedEventId] || localUnlockedEvents[resolvedEventId];

    const isLocked = displayEvent?.isProtected && !bundle?.accessCode && !isUnlocked;
    if (isLocked) {
      setLockedEventId(resolvedEventId);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    setActiveEventMap(null);
    setActiveCart({ items: [] });
    try {
      const [eventRes, mapRes, cartItems] = await Promise.all([
        apiClient.get(`/o/${orgSlug}/events/${resolvedEventId}`),
        apiClient.get(`/o/${orgSlug}/events/${resolvedEventId}/seatmap?sessionId=${sessionId}`, { params: { bundleId } }),
        fetchCart(),
      ]);
      setResolvedEvent(eventRes.data.event);
      const upcoming = (eventRes.data.sessions || []).filter(s => new Date(s.dateTime) >= new Date());
      setActiveEventSessions(upcoming);
      if (upcoming.length === 0) {
        setError("This event is no longer active as all of its session dates have passed.");
      }
      setActiveEventMap(mapRes.data.seatmap);
      setActiveCart({ items: cartItems.filter((item) => String(item.eventId) === String(resolvedEventId) && String(item.bundleId || "") === String(bundleId) && item.itemType !== "bundle") });
      setLockedEventId(null);
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.isProtected) {
        setLockedEventId(resolvedEventId);
      } else {
        setError("Could not load seat map or cart reservation.");
      }
    } finally {
      setLoading(false);
    }
  };

  const activeSessionId = activeEvent ? (selectedSessionIds[activeEvent._id] || "") : "";

  useEffect(() => {
    loadActiveEventMapAndCart();
  }, [activeEvent, activeSessionId]);

  // Keep every open bundle map aligned with live seat holds/sales from other buyers.
  useEffect(() => {
    if (!activeEvent?._id) return undefined;
    const refreshLiveState = async () => {
      try {
        const sessionId = selectedSessionIds[activeEvent._id] || "";
        const [mapRes, cartItems] = await Promise.all([
          apiClient.get(`/o/${orgSlug}/events/${activeEvent._id}/seatmap?sessionId=${sessionId}`),
          fetchCart(),
        ]);
        setActiveEventMap(mapRes.data.seatmap);
        setActiveCart({ items: cartItems.filter((item) => String(item.eventId) === String(activeEvent._id) && String(item.bundleId || "") === String(bundleId) && item.itemType !== "bundle") });
      } catch {
        // A transient refresh failure should not interrupt the buyer's selection.
      }
    };
    const interval = window.setInterval(refreshLiveState, 3000);
    return () => window.clearInterval(interval);
  }, [orgSlug, bundleId, activeEvent?._id, activeSessionId]);

  const handleUnlockEventSubmit = async (e) => {
    e.preventDefault();
    setVerifyingCode(true);
    setUnlockError("");
    const targetId = selectedSessionIds[activeEvent.parentEventId || activeEvent._id] || activeEvent._id;
    try {
      await apiClient.post(`/o/${orgSlug}/events/${targetId}/verify-access`, {
        accessCode: unlockCodeInput,
      });
      const saved = JSON.parse(sessionStorage.getItem("unlockedCodes") || "{}");
      saved[targetId] = unlockCodeInput;
      sessionStorage.setItem("unlockedCodes", JSON.stringify(saved));

      setLocalUnlockedEvents((prev) => ({ ...prev, [targetId]: true }));
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
    const key = seatKey(block.id, seat.id);
    const exists = selectedIds.has(key);
    if ((!exists && seat.status !== "available") || busy) return;
    setError("");

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
    const sessionId = selectedSessionIds[activeEvent._id] || "";
    try {
      if (exists) {
        await serverUnlockSeat({ eventId: activeEvent._id, eventSessionId: sessionId, blockId: block.id, seatId: seat.id });
      } else {
        await serverLockSeat({
          eventId: activeEvent._id,
          eventSessionId: sessionId,
          blockId: block.id,
          seatId: seat.id,
          seatName: seat.seatName,
          sectionName: block.name,
          category: block.category || null,
          unitPrice: 0,
          bundleId: bundle._id,
        });
      }
      const cartItems = await fetchCart();
      setActiveCart({ items: cartItems.filter((item) => String(item.eventId) === String(activeEvent._id) && String(item.bundleId || "") === String(bundleId) && item.itemType !== "bundle") });
      const mapRes = await apiClient.get(`/o/${orgSlug}/events/${activeEvent._id}/seatmap?sessionId=${sessionId}`);
      setActiveEventMap(mapRes.data.seatmap);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update selection.");
    } finally {
      setBusy(false);
    }
  };

  const changeGaQuantity = async (block, increment) => {
    if (busy) return;
    const current = activeCart.items.filter((item) => item.blockId === block.id);
    const cartSeatIds = new Set(current.map((item) => item.seatId));
    const candidate = increment
      ? block.seats?.find((seat) => seat.status === "available" && !cartSeatIds.has(seat.id))
      : current.at(-1);
    if (!candidate) return;

    if (increment && activeCart.items.length >= requiredQty) {
      setError(`You can only select up to ${requiredQty} seats for this event.`);
      return;
    }

    setBusy(true);
    setError("");
    const sessionId = selectedSessionIds[activeEvent._id] || "";
    try {
      if (increment) {
        await serverLockSeat({
          eventId: activeEvent._id, eventSessionId: sessionId, blockId: block.id, seatId: candidate.id,
          seatName: candidate.seatName || "GA Ticket", sectionName: block.name, category: block.category || null,
          unitPrice: 0, bundleId: bundle._id,
        });
      } else {
        await serverUnlockSeat({ eventId: activeEvent._id, eventSessionId: sessionId, blockId: block.id, seatId: candidate.seatId || candidate.id });
      }
      const cartItems = await fetchCart();
      setActiveCart({ items: cartItems.filter((item) => String(item.eventId) === String(activeEvent._id) && String(item.bundleId || "") === String(bundleId) && item.itemType !== "bundle") });
      const mapRes = await apiClient.get(`/o/${orgSlug}/events/${activeEvent._id}/seatmap?sessionId=${sessionId}`);
      setActiveEventMap(mapRes.data.seatmap);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update General Admission quantity.");
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

  const handleCheckout = async () => {
    if (activeCart.items.length !== requiredQty) {
      setError(`Please select exactly ${requiredQty} seats for this event.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await apiClient.post(`/o/${orgSlug}/bundles/${bundleId}/cart`, {}, {
        headers: { "X-Cart-Id": getCartId() },
      });
      const finalizedItems = res.data.cart?.items || [];
      const finalizedBundle = finalizedItems.find(
        (item) => item.itemType === "bundle" && String(item.bundleId) === String(bundleId)
      );
      if (!finalizedBundle) {
        throw new Error("The bundle could not be finalized in your cart. Please try again.");
      }
      setLocalCart(finalizedItems);
      navigate("/cart");
    } catch (err) {
      setError(err.response?.data?.message || "Could not add this bundle to your cart.");
    } finally {
      setBusy(false);
    }
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

  const individualItems = activeCart.items.filter(
    (item) => !activeEventMap?.blocks?.find((block) => block.id === item.blockId && block.type === "general-admission"),
  );

  const gaBlocks = filteredEventMap?.blocks?.filter((block) => block.type === "general-admission") || [];

  const currentSessionId = selectedSessionIds[activeEvent?._id] || (activeEventSessions[0]?._id) || "";
  const activeSession = activeEventSessions.find(s => String(s._id) === String(currentSessionId));

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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
              <h1 className="ss-title" style={{ margin: 0 }}>{displayEvent?.name}</h1>
              {activeEventSessions.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Session:</span>
                  <select
                    value={currentSessionId}
                    onChange={(e) => {
                      const newSessionId = e.target.value;
                      setSelectedSessionIds({
                        ...selectedSessionIds,
                        [activeEvent._id]: newSessionId
                      });
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      background: "#111326",
                      color: "#fff",
                      border: "1px solid rgba(255,255,255,0.15)",
                      fontSize: "13px",
                      fontWeight: 600,
                      outline: "none"
                    }}
                  >
                    {activeEventSessions.map((s) => (
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
            </div>
            <p className="ss-subtitle">
              📅 {activeSession ? new Date(activeSession.dateTime).toLocaleString() : (displayEvent?.dateTime ? new Date(displayEvent.dateTime).toLocaleString() : "")} · {bundle.venueId?.name}
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

          {((displayEvent?.isProtected || lockedEventId === displayEvent?._id) && !localUnlockedEvents[displayEvent?._id]) ? (
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
                  onGaClick={(block) => changeGaQuantity(block, true)}
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

            {/* GA blocks */}
            {gaBlocks.length > 0 && (
              <div className="ss-ga-blocks" style={{ marginBottom: 20 }}>
                {gaBlocks.map((block) => {
                  const quantity = activeCart.items.filter((item) => item.blockId === block.id).length;
                  return (
                    <div key={block.id} className="ss-ga-row">
                      <div className="ss-ga-row__info">
                        <p className="ss-ga-row__name">{block.name}</p>
                        <p className="ss-ga-row__price">Included in Bundle</p>
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

            <div className="ss-seat-list">
              {individualItems.length === 0 && gaBlocks.length === 0 ? (
                <div className="ss-empty-state">
                  <div className="ss-empty-state__icon">🎟</div>
                  <p>Click seats on the map to add them here.</p>
                </div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {individualItems.map((item) => (
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
                  {busy ? "Adding to cart…" : "Add bundle to cart →"}
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
