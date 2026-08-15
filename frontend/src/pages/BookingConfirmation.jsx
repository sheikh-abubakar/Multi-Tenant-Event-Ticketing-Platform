import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { setLocalCart } from "../utils/cart";
import "./BuyerContextPages.css";

const BookingConfirmation = () => {
  const { user } = useAuth();
  const { orgSlug, bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const isSeatChangeSuccess = searchParams.get("seat_change_success") === "1";
  const isSeatChangeCancel = searchParams.get("seat_change_cancel") === "1";

  const [booking, setBooking] = useState(null);
  const [bundleBookings, setBundleBookings] = useState([]);
  const [checkoutBookings, setCheckoutBookings] = useState([]);
  const [seatChangeRequests, setSeatChangeRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const confirmAndLoad = async () => {
      setLoading(true);
      setError("");

      try {
        // Step 1: Confirm the booking via API (generates QR + sends email)
        if (sessionId && bookingId) {
          await apiClient.get(
            `/o/${orgSlug}/bookings/${bookingId}/confirm?session_id=${sessionId}`,
          );
          setLocalCart([]);
        }

        // Step 2: Fetch booking details
        const res = await apiClient.get(
          `/o/${orgSlug}/bookings/${bookingId}`,
        );
        
        if (!cancelled) {
          const mainBooking = res.data.booking;
          setBooking(mainBooking);

          try {
            const checkoutRes = await apiClient.get(`/o/${orgSlug}/bookings/${bookingId}/checkout`);
            setCheckoutBookings(checkoutRes.data.bookings || [mainBooking]);
          } catch (checkoutError) {
            console.warn("Could not load the complete checkout total:", checkoutError);
            setCheckoutBookings([mainBooking]);
          }

          // If this is a bundle, fetch all linked bookings
          if (mainBooking.isBundleBooking && mainBooking.bundleBookingId) {
            const bundleRes = await apiClient.get(`/o/${orgSlug}/bookings/bundle/${mainBooking.bundleBookingId}`);
            setBundleBookings(bundleRes.data.bookings || []);
          }
        }
      } catch (err) {
        if (!cancelled) {
          // If confirm step failed (e.g. already confirmed), try fetching directly
          try {
            const res = await apiClient.get(
              `/o/${orgSlug}/bookings/${bookingId}`,
            );
            if (!cancelled) {
              const mainBooking = res.data.booking;
              setBooking(mainBooking);

              try {
                const checkoutRes = await apiClient.get(`/o/${orgSlug}/bookings/${bookingId}/checkout`);
                setCheckoutBookings(checkoutRes.data.bookings || [mainBooking]);
              } catch (checkoutError) {
                console.warn("Could not load the complete checkout total:", checkoutError);
                setCheckoutBookings([mainBooking]);
              }

              if (mainBooking.isBundleBooking && mainBooking.bundleBookingId) {
                const bundleRes = await apiClient.get(`/o/${orgSlug}/bookings/bundle/${mainBooking.bundleBookingId}`);
                setBundleBookings(bundleRes.data.bookings || []);
              }
            }
          } catch (fetchErr) {
            if (!cancelled) {
              setError(
                fetchErr.response?.data?.message ||
                  "Could not load booking confirmation.",
              );
            }
          }
        }
      }

      // Fetch seat change requests
      try {
        const reqsRes = await apiClient.get("/seat-change/my");
        if (!cancelled) {
          setSeatChangeRequests(reqsRes.data.requests || []);
        }
      } catch (reqsErr) {
        console.warn("Could not load seat change requests:", reqsErr);
      }

      if (!cancelled) setLoading(false);
    };

    if (bookingId) {
      confirmAndLoad();
    }
    return () => { cancelled = true; };
  }, [orgSlug, bookingId, sessionId]);

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{ display: "inline-block", border: "4px solid rgba(255,255,255,0.1)", borderLeftColor: "var(--gold)", borderRadius: "50%", width: 36, height: 36, animation: "spin 1s linear infinite" }} />
        <p style={{ color: "var(--muted)", marginTop: 12 }}>
          Please wait while we process your booking.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <h3 style={{ marginTop: 0, color: "var(--danger)" }}>
          Confirmation Error
        </h3>
        <p>{error}</p>
        <p>
          <Link to={`/o/${orgSlug}/events`}>Browse events</Link>
        </p>
      </div>
    );
  }

  if (!booking) return null;

  const isConfirmed =
    booking.status === "confirmed" && booking.paymentStatus === "paid";
  const bookedEventDateTime = booking.eventDateTime || booking.eventId?.dateTime;
  const checkoutTotal = checkoutBookings.length
    ? checkoutBookings.reduce((total, currentBooking) => total + Number(currentBooking.totalAmount || 0), 0)
    : Number(booking.totalAmount || 0);
  const isCombinedCheckout = checkoutBookings.length > 1;

  return (
    <div className="confirmation-page buyer-context-page" style={{ maxWidth: 820, margin: "0 auto" }}>
      <Link to={user ? "/my/bookings" : `/o/${orgSlug}/events`} className="buyer-hub-back"><ArrowLeft size={15} /> {user ? "Back to my bookings" : "Back to events"}</Link>
      {/* ── Header ── */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: isConfirmed
              ? "rgba(22, 163, 74, 0.15)"
              : "rgba(234, 179, 8, 0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 16px",
            fontSize: 28,
          }}
        >
          {isConfirmed ? "✅" : "⏳"}
        </div>
        {/* On dark page background — var(--paper) is correct here */}
        <h1 style={{ color: "var(--paper)", margin: 0 }}>
          {isConfirmed ? "Booking Confirmed!" : "Payment Pending"}
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 8 }}>
          {isConfirmed
            ? "Your tickets have been booked and a confirmation email is on its way."
            : "Your booking is being processed. Check your email for updates."}
        </p>
      </div>

      {isSeatChangeSuccess && (
        <div style={{ background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: 8, padding: 16, color: "#10b981", marginBottom: 16, textAlign: "center" }}>
          <strong>✓ Seat change request submitted successfully!</strong> The organizer has been notified to review your seat swap.
        </div>
      )}

      {isSeatChangeCancel && (
        <div style={{ background: "rgba(220, 38, 38, 0.08)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: 8, padding: 16, color: "#dc2626", marginBottom: 16, textAlign: "center" }}>
          <strong>⚠️ Seat change upgrade fee payment was cancelled.</strong>
        </div>
      )}

      {/* ── Booking Details ── */}
      <div className="card confirmation-details-card" style={{ marginBottom: 16 }}>
        {/* Inside a .card (light background) — var(--text) is correct here */}
        <h3 style={{ marginTop: 0, color: "var(--text)" }}>Booking Details</h3>

        <div style={styles.detailGrid}>
          <div>
            <p style={styles.label}>Confirmation Code</p>
            <p style={styles.value}>{booking.confirmationCode || "—"}</p>
          </div>
          <div>
            <p style={styles.label}>Status</p>
            <p style={styles.value}>
              <span
                className="badge"
                style={{
                  background: isConfirmed
                    ? "rgba(22, 163, 74, 0.15)"
                    : "rgba(234, 179, 8, 0.15)",
                  color: isConfirmed ? "#16a34a" : "#eab308",
                }}
              >
                {booking.status}
              </span>
            </p>
          </div>
          <div>
            <p style={styles.label}>{isCombinedCheckout ? "Order Total Paid" : "Total Paid"}</p>
            <p
              style={{
                ...styles.value,
                fontWeight: 700,
                color: "var(--gold)",
              }}
            >
              ${checkoutTotal.toFixed(2)}
            </p>
          </div>
          <div>
            <p style={styles.label}>Buyer Email</p>
            <p style={styles.value}>{booking.buyerEmail}</p>
          </div>
          <div>
            <p style={styles.label}>Event</p>
            <p style={styles.value}>{booking.eventName || booking.eventId?.name || "Event"}</p>
          </div>
          <div>
            <p style={styles.label}>Event Date &amp; Time</p>
            <p style={styles.value}>
              {bookedEventDateTime
                ? new Date(bookedEventDateTime).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })
                : "To be announced"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Ticket Summary & QR Code(s) ── */}
      {booking.isBundleBooking && bundleBookings.length > 0 ? (
        <div style={{ display: "grid", gap: 16 }}>
          <h2 style={{ color: "var(--paper)", margin: "10px 0 0", fontSize: 18 }}>Your Bundle Tickets</h2>
          {bundleBookings.map((b, idx) => (
            <div key={b._id} className="card" style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 260 }}>
                <span className="badge" style={{ background: "rgba(201,154,60,0.15)", color: "#c99a3c", marginBottom: 8, display: "inline-block" }}>
                  Event {idx + 1}
                </span>
                <h3 style={{ margin: "0 0 6px", color: "var(--text)" }}>{b.eventName}</h3>
                <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
                  📅 {b.eventDateTime ? new Date(b.eventDateTime).toLocaleString() : b.eventId?.dateTime ? new Date(b.eventId.dateTime).toLocaleString() : "TBD"}
                </p>
                <div style={{ marginTop: 12 }}>
                  <p style={styles.label}>Selected Seats</p>
                  <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
                    {b.selectedSeats?.map((s) => {
                      const isPendingChange = seatChangeRequests.some(
                        (r) => String(r.bookingId?._id || r.bookingId) === String(b._id) && r.oldSeat?.seatId === s.seatId && r.status === "pending"
                      );
                      return (
                        <div key={`${s.blockId}-${s.seatId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 700, color: "var(--text)", fontSize: 14 }}>
                            {s.sectionName} — {s.seatName}
                          </span>
                          {isPendingChange ? (
                            <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>
                              🔄 Change Pending
                            </span>
                          ) : (
                            isConfirmed && !((b.eventDateTime || b.eventId?.dateTime) && new Date(b.eventDateTime || b.eventId?.dateTime) < new Date()) && (
                              <Link
                                to={`/o/${orgSlug}/bookings/${b._id}/change-seat/${s.seatId}`}
                                style={{
                                  padding: "4px 8px",
                                  background: "var(--gold)",
                                  color: "var(--paper)",
                                  borderRadius: 4,
                                  fontSize: 11,
                                  fontWeight: 600,
                                  textDecoration: "none",
                                }}
                              >
                                Change Seat
                              </Link>
                            )
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {b.qrCodeUrl && (
                <div style={{ textAlign: "center" }}>
                  <img
                    src={b.qrCodeUrl}
                    alt="Ticket QR Code"
                    style={{
                      display: "block",
                      maxWidth: 130,
                      border: "2px solid var(--gold)",
                      borderRadius: 8,
                      padding: 4,
                      background: "white",
                    }}
                  />
                  <span style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, display: "block" }}>
                    Scan at Entrance
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="card confirmation-tickets-card" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0, color: "var(--text)" }}>Ticket Summary</h3>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(247, 242, 231, 0.1)" }}>
                  <th style={{ textAlign: "left", padding: "8px 4px", color: "var(--muted)" }}>
                    Ticket Type
                  </th>
                  <th style={{ textAlign: "center", padding: "8px 4px", color: "var(--muted)" }}>
                    Qty
                  </th>
                  <th style={{ textAlign: "right", padding: "8px 4px", color: "var(--muted)" }}>
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {(booking.items || []).map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(247, 242, 231, 0.06)" }}>
                    <td style={{ padding: "10px 4px", color: "var(--text)" }}>{item.ticketTypeName}</td>
                    <td style={{ padding: "10px 4px", textAlign: "center", color: "var(--text)" }}>{item.quantity}</td>
                    <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 700, color: "var(--text)" }}>$ {item.lineTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {booking.selectedSeats && booking.selectedSeats.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0, color: "var(--text)" }}>Your Seats</h3>
              <div style={{ display: "grid", gap: 12 }}>
                {booking.selectedSeats.map((seat) => {
                  const isPendingChange = seatChangeRequests.some(
                    (r) => String(r.bookingId?._id || r.bookingId) === String(booking._id) && r.oldSeat?.seatId === seat.seatId && r.status === "pending"
                  );
                  return (
                    <div key={`${seat.blockId}-${seat.seatId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong style={{ display: "block", color: "var(--text)", fontSize: 14 }}>
                          {seat.seatName} ({seat.sectionName || "General"})
                        </strong>
                        <span style={{ fontSize: 12, color: "var(--muted)" }}>
                          Price: ${seat.unitPrice}
                        </span>
                      </div>
                      {isPendingChange ? (
                        <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>
                          🔄 Change Pending
                        </span>
                      ) : (
                        isConfirmed && !((booking.eventDateTime || booking.eventId?.dateTime) && new Date(booking.eventDateTime || booking.eventId?.dateTime) < new Date()) && (
                          <Link
                            to={`/o/${orgSlug}/bookings/${booking._id}/change-seat/${seat.seatId}`}
                            style={{
                              padding: "6px 12px",
                              background: "var(--gold)",
                              color: "var(--paper)",
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              textDecoration: "none",
                            }}
                          >
                            Change Seat
                          </Link>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {booking.qrCodeUrl && (
            <div className="card confirmation-qr-card" style={{ marginBottom: 16, textAlign: "center" }}>
              <h3 style={{ marginTop: 0, color: "var(--text)" }}>Your QR Code</h3>
              <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>
                Show this at the event entrance for scanning.
              </p>
              <img
                src={booking.qrCodeUrl}
                alt="Booking QR Code"
                style={{
                  display: "block",
                  margin: "0 auto",
                  maxWidth: 220,
                  border: "3px solid var(--gold)",
                  borderRadius: 12,
                  padding: 8,
                  background: "white",
                }}
              />
            </div>
          )}
        </>
      )}

      {/* ── Browse More ── */}
      <div style={{ textAlign: "center", margin: "24px 0" }}>
        <Link
          to={`/o/${orgSlug}/events`}
          className="badge"
          style={{ textDecoration: "none", padding: "10px 20px" }}
        >
          Browse More Events
        </Link>
      </div>
    </div>
  );
};

const styles = {
  detailGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
  label: {
    margin: 0,
    fontSize: 12,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  // Was var(--paper) — light text for dark backgrounds — but this style
  // is only used for values INSIDE a .card (light background), so
  // var(--text) is correct here to keep them readable.
  value: {
    margin: "4px 0 0",
    color: "var(--text)",
    fontSize: 15,
  },
};

export default BookingConfirmation;
