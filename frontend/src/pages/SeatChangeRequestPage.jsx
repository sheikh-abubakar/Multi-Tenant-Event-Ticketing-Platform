import React, { useState, useEffect, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import SeatMapCanvas from "../components/seatmap/SeatMapCanvas";

export default function SeatChangeRequestPage() {
  const { orgSlug, bookingId, seatId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [eventMap, setEventMap] = useState(null);
  const [wallet, setWallet] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);

  // Selection states
  const [selectedSeat, setSelectedSeat] = useState(null); // { block, seat }
  const [reason, setReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("wallet");

  // Format seat keys
  const seatKey = (blockId, seatId) => `${blockId}:${seatId}`;

  // Find the user's current seat in the booking
  const originalSeat = useMemo(() => {
    if (!booking) return null;
    return booking.selectedSeats.find(
      (s) => s.seatId === seatId || `${s.blockId}-${s.seatId}` === seatId
    );
  }, [booking, seatId]);

  useEffect(() => {
    const loadDetails = async () => {
      try {
        setLoading(true);
        setError("");

        // Fetch Booking, Wallet, and Event Seatmap
        const [bookingRes, walletRes] = await Promise.all([
          apiClient.get(`/o/${orgSlug}/bookings/${bookingId}`),
          apiClient.get("/wallet").catch(() => ({ data: { wallet: { balance: 0 } } })), // fallback if wallet fails
        ]);

        const bk = bookingRes.data.booking;
        setBooking(bk);
        setWallet(walletRes.data.wallet);

        const eventId = bk.eventId?._id || bk.eventId;
        const [eventRes, mapRes] = await Promise.all([
          apiClient.get(`/o/${orgSlug}/events/${eventId}`),
          apiClient.get(`/o/${orgSlug}/events/${eventId}/seatmap?bookingId=${bookingId}`)
        ]);

        const sess = eventRes.data.sessions || [];
        setSessions(sess);
        setSelectedSessionId(bk.sessionId || sess[0]?._id || "");
        setEventMap(mapRes.data.seatmap);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load booking details.");
      } finally {
        setLoading(false);
      }
    };
    loadDetails();
  }, [orgSlug, bookingId]);

  const handleSessionChange = async (newSessionId) => {
    setSelectedSessionId(newSessionId);
    setSelectedSeat(null);
    try {
      setLoading(true);
      setError("");
      const eventId = booking.eventId?._id || booking.eventId;
      const mapRes = await apiClient.get(`/o/${orgSlug}/events/${eventId}/seatmap?bookingId=${bookingId}&sessionId=${newSessionId}`);
      setEventMap(mapRes.data.seatmap);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load seat map for this session.");
    } finally {
      setLoading(false);
    }
  };

  const selectedIds = useMemo(() => {
    const s = new Set();
    if (selectedSeat) {
      s.add(seatKey(selectedSeat.block.id, selectedSeat.seat.id));
    }
    return s;
  }, [selectedSeat]);

  const priceDifference = useMemo(() => {
    if (!originalSeat || !selectedSeat) return 0;
    if (booking?.isBundleBooking || booking?.bundleBookingId) return 0;
    return selectedSeat.block.price - originalSeat.unitPrice;
  }, [originalSeat, selectedSeat, booking]);

  const handleSeatClick = (block, seat) => {
    if (seat.status !== "available") return;
    setError("");

    // Prevent selecting the same seat they currently hold
    if (block.id === originalSeat?.blockId && seat.id === originalSeat?.seatId) {
      setError("This is your currently occupied seat.");
      return;
    }

    if (selectedSeat && selectedSeat.block.id === block.id && selectedSeat.seat.id === seat.id) {
      setSelectedSeat(null);
    } else {
      setSelectedSeat({ block, seat });
    }
  };

  const handleGaClick = (block) => {
    setError("");
    const availableSeat = block.seats?.find((s) => s.status === "available");
    if (!availableSeat) {
      setError("No available General Admission slots left in this section.");
      return;
    }
    handleSeatClick(block, availableSeat);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSeat) {
      setError("Please select a new seat from the seat map.");
      return;
    }

    // Verify wallet balance if wallet payment chosen
    if (priceDifference > 0 && paymentMethod === "wallet" && wallet && wallet.balance < priceDifference) {
      setError("Insufficient wallet balance for this seat change upgrade.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        bookingId,
        oldSeatId: seatId,
        newSeat: {
          blockId: selectedSeat.block.id,
          seatId: selectedSeat.seat.id,
          seatName: selectedSeat.seat.seatName,
          sectionName: selectedSeat.block.name,
          unitPrice: (booking.isBundleBooking || booking.bundleBookingId) ? originalSeat.unitPrice : selectedSeat.block.price,
        },
        reason,
        paymentMethod,
        newSessionId: selectedSessionId,
      };

      const res = await apiClient.post(`/o/${orgSlug}/seat-change/requests`, payload);

      if (res.data.checkoutUrl) {
        // Stripe checkout redirect
        window.location.href = res.data.checkoutUrl;
      } else {
        setSuccess(true);
        setTimeout(() => {
          navigate(`/my/dashboard`);
        }, 2000);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to submit seat change request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ color: "var(--muted)", padding: "100px 20px", textAlign: "center" }}>
        <p>Loading interactive seat map and request details...</p>
      </div>
    );
  }

  if (!booking || !originalSeat) {
    return (
      <div style={{ maxWidth: 800, margin: "40px auto", padding: "0 20px" }}>
        <div className="rounded-lg bg-red-50 p-4 text-danger border border-red-200">
          Booking or original seat not found.
        </div>
        <Link to="/my/dashboard" className="mt-4 inline-block text-gold-soft">
          &larr; Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 10px" }}>
      <Link to="/my/dashboard" className="text-gold-soft" style={{ textDecoration: "none", fontSize: 14 }}>
        &larr; Back to Dashboard
      </Link>

      <h1 className="font-display text-4xl text-paper" style={{ margin: "16px 0 6px" }}>Request Seat Change</h1>
      <p style={{ color: "var(--muted)", marginBottom: 24 }}>
        Select a new available seat from the seat map below. If the new seat is more expensive, you will need to pay the upgrade difference upfront.
      </p>

      {success && (
        <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 12, padding: 16, color: "#10b981", marginBottom: 20 }}>
          <strong>✓ Seat change request submitted successfully!</strong> Redirecting you to your dashboard...
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-danger border border-red-100" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Top: Interactive Seat Map */}
        <section className="rounded-2xl bg-paper p-6 shadow-xl" style={{ border: "1px solid rgba(255, 255, 255, 0.05)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 12 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, color: "var(--gold-soft)", margin: 0 }}>
              Interactive Seat Map — {booking.eventName}
            </h2>
            
            {sessions.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)" }}>Event Date/Session:</span>
                <select
                  value={selectedSessionId || ""}
                  onChange={(e) => handleSessionChange(e.target.value)}
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
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
            Legend: Dark seats are sold or unavailable. Gold border indicates your selected seat.
          </p>

          {eventMap ? (
            <div className="ss-canvas-wrap">
              <SeatMapCanvas
                map={eventMap}
                selectedIds={selectedIds}
                onSeatClick={handleSeatClick}
                onGaClick={handleGaClick}
                className="ss-canvas"
              />
            </div>
          ) : (
            <div style={{ height: 400, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
              No seat map configuration available for this event.
            </div>
          )}
        </section>

        {/* Bottom: Summary Card */}
        <div style={{ width: "100%" }}>
          <div className="rounded-2xl bg-paper p-6 shadow-xl" style={{ border: "1px solid rgba(20, 22, 43, 0.08)", color: "var(--text)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, borderBottom: "1px solid rgba(20, 22, 43, 0.1)", paddingBottom: 10, marginBottom: 16, color: "var(--text)" }}>
              Request Summary
            </h3>

            {booking && (booking.isBundleBooking || booking.bundleBookingId) && (
              <div style={{ background: "rgba(201, 154, 60, 0.08)", border: "1px solid rgba(201, 154, 60, 0.2)", borderRadius: 12, padding: 12, marginBottom: 16, color: "var(--gold-soft)", fontSize: 13 }}>
                <strong>Bundle Booking Override:</strong> Seat change request for events in a bundle is free of charge.
              </div>
            )}

            {/* Original Seat */}
            <div style={{ marginBottom: 16 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>Current Occupied Seat</span>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <strong style={{ fontSize: 14 }}>{originalSeat.seatName} ({originalSeat.sectionName || "General"})</strong>
                <span style={{ fontSize: 14, color: "var(--gold)" }}>${originalSeat.unitPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* New Seat */}
            <div style={{ marginBottom: 16, borderBottom: "1px solid rgba(20, 22, 43, 0.08)", paddingBottom: 16 }}>
              <span style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", fontWeight: 600 }}>New Requested Seat</span>
              {selectedSeat ? (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                  <strong style={{ fontSize: 14, color: "#10b981" }}>{selectedSeat.seat.seatName} ({selectedSeat.block.name || "General"})</strong>
                  <span style={{ fontSize: 14, color: "var(--gold)" }}>${selectedSeat.block.price.toFixed(2)}</span>
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 0" }}>None selected</p>
              )}
            </div>

            {/* Price Difference Calculation */}
            {selectedSeat && (
              <div style={{ padding: 12, borderRadius: 8, background: "rgba(20, 22, 43, 0.05)", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>Price difference:</span>
                  <strong style={{ color: (booking.isBundleBooking || booking.bundleBookingId) ? "#10b981" : (priceDifference > 0 ? "var(--gold)" : "#10b981") }}>
                    {(booking.isBundleBooking || booking.bundleBookingId) ? "$0.00 (Bundle Override)" : (priceDifference > 0 ? `+$${priceDifference.toFixed(2)}` : priceDifference < 0 ? `Refund -$${Math.abs(priceDifference).toFixed(2)}` : "$0.00 (Same Price)")}
                  </strong>
                </div>
                {priceDifference < 0 && !(booking.isBundleBooking || booking.bundleBookingId) && (
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0" }}>
                    * The refund difference will be credited to your wallet balance automatically upon admin approval.
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Reason for Seat Change</label>
                <textarea
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Want a better view / Sit closer to friends"
                  rows={3}
                  className="w-full rounded-md border border-black/15 px-3 py-2 text-ink"
                  style={{ color: "#111326", fontSize: 13 }}
                />
              </div>

              {/* Upfront Payment Selector if positive difference */}
              {priceDifference > 0 && (
                <div style={{ borderTop: "1px solid rgba(20, 22, 43, 0.08)", paddingTop: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Select Payment Method</label>
                  <div style={{ display: "grid", gap: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 12px", border: "1px solid rgba(20,22,43,0.1)", borderRadius: 8, background: paymentMethod === "wallet" ? "rgba(201, 154, 60, 0.12)" : "transparent" }}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="wallet"
                        checked={paymentMethod === "wallet"}
                        onChange={() => setPaymentMethod("wallet")}
                      />
                      <div style={{ fontSize: 13, color: "var(--text)" }}>
                        <strong>Wallet Balance</strong>
                        <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>Available: ${wallet?.balance?.toFixed(2) || "0.00"}</span>
                      </div>
                    </label>

                    <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "8px 12px", border: "1px solid rgba(20,22,43,0.1)", borderRadius: 8, background: paymentMethod === "stripe" ? "rgba(201, 154, 60, 0.12)" : "transparent" }}>
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="stripe"
                        checked={paymentMethod === "stripe"}
                        onChange={() => setPaymentMethod("stripe")}
                      />
                      <div style={{ fontSize: 13, color: "var(--text)" }}>
                        <strong>Credit Card (Stripe)</strong>
                        <span style={{ display: "block", fontSize: 11, color: "var(--muted)" }}>Secure card payment</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !selectedSeat || success}
                className="rounded-lg bg-gold px-4 py-2.5 font-bold text-ink"
                style={{ width: "100%", marginTop: 10 }}
              >
                {submitting ? "Processing Request..." : priceDifference > 0 ? "Pay Upgrade & Submit" : "Submit Request"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
