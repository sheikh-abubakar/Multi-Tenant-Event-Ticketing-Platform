import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import apiClient from "../api/client";

const BookingConfirmation = () => {
  const { orgSlug, bookingId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");

  const [booking, setBooking] = useState(null);
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
        }

        // Step 2: Fetch booking details
        const res = await apiClient.get(
          `/o/${orgSlug}/bookings/${bookingId}`,
        );
        if (!cancelled) {
          setBooking(res.data.booking);
        }
      } catch (err) {
        if (!cancelled) {
          // If confirm step failed (e.g. already confirmed), try fetching directly
          try {
            const res = await apiClient.get(
              `/o/${orgSlug}/bookings/${bookingId}`,
            );
            if (!cancelled) {
              setBooking(res.data.booking);
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
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (bookingId) {
      confirmAndLoad();
    }
    return () => { cancelled = true; };
  }, [orgSlug, bookingId, sessionId]);

  if (loading) {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
        <div className="card">
          <p style={{ color: "var(--muted)", fontSize: 18 }}>
            Confirming your payment…
          </p>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Please wait while we process your booking.
          </p>
        </div>
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

  return (
    <div className="confirmation-page" style={{ maxWidth: 740, margin: "0 auto" }}>
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
        {/* This h1 is on the dark page background (not inside a .card),
            so var(--paper) — light text for dark backgrounds — is
            correct here. Left unchanged. */}
        <h1 style={{ color: "var(--paper)", margin: 0 }}>
          {isConfirmed ? "Booking Confirmed!" : "Payment Pending"}
        </h1>
        <p style={{ color: "var(--muted)", marginTop: 8 }}>
          {isConfirmed
            ? "Your tickets have been booked and a confirmation email is on its way."
            : "Your booking is being processed. Check your email for updates."}
        </p>
      </div>

      <div className="card confirmation-details-card" style={{ marginBottom: 16 }}>
        {/* Inside a .card (light background) — must use var(--text),
            not var(--paper), or the heading is invisible. */}
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
            <p style={styles.label}>Total Paid</p>
            <p
              style={{
                ...styles.value,
                fontWeight: 700,
                color: "var(--gold)",
              }}
            >
              Rs. {booking.totalAmount}
            </p>
          </div>
          <div>
            <p style={styles.label}>Buyer Email</p>
            <p style={styles.value}>{booking.buyerEmail}</p>
          </div>
        </div>
      </div>

      <div className="card confirmation-tickets-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, color: "var(--text)" }}>Ticket Summary</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                borderBottom: "1px solid rgba(247, 242, 231, 0.1)",
              }}
            >
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 4px",
                  color: "var(--muted)",
                }}
              >
                Ticket Type
              </th>
              <th
                style={{
                  textAlign: "center",
                  padding: "8px 4px",
                  color: "var(--muted)",
                }}
              >
                Qty
              </th>
              <th
                style={{
                  textAlign: "right",
                  padding: "8px 4px",
                  color: "var(--muted)",
                }}
              >
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {(booking.items || []).map((item, idx) => (
              <tr
                key={idx}
                style={{
                  borderBottom: "1px solid rgba(247, 242, 231, 0.06)",
                }}
              >
                <td style={{ padding: "10px 4px", color: "var(--text)" }}>
                  {item.ticketTypeName}
                </td>
                <td style={{ padding: "10px 4px", textAlign: "center", color: "var(--text)" }}>
                  {item.quantity}
                </td>
                <td
                  style={{
                    padding: "10px 4px",
                    textAlign: "right",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  Rs. {item.lineTotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {booking.qrCodeUrl && (
        <div className="card confirmation-qr-card" style={{ textAlign: "center" }}>
          <h3 style={{ marginTop: 0, color: "var(--text)" }}>
            Your QR Code
          </h3>
          <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 16 }}>
            Show this at the event entrance for scanning.
          </p>
          <img
            src={booking.qrCodeUrl}
            alt="Booking QR Code"
            style={{
              maxWidth: 220,
              border: "3px solid var(--gold)",
              borderRadius: 12,
              padding: 8,
              background: "white",
            }}
          />
        </div>
      )}

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
  // Was var(--paper) — light text meant for the dark page background —
  // but this style is only ever used for values INSIDE a .card (light
  // background), which made them invisible/unreadable except when
  // selected with the mouse. See BookingConfirmation card values.
  value: {
    margin: "4px 0 0",
    color: "var(--text)",
    fontSize: 15,
  },
};

export default BookingConfirmation;
