import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Ticket, ArrowLeft, ArrowRight, Clock, CreditCard, TrendingUp, ChevronDown, X } from "lucide-react";
import apiClient from "../api/client";

const BuyerDashboard = () => {
  const [wallet, setWallet] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refundModal, setRefundModal] = useState(null); // booking object or null
  const [refunding, setRefunding] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [walletRes, bookingsRes] = await Promise.all([
        apiClient.get("/wallet"),
        apiClient.get("/bookings/mine"),
      ]);
      setWallet(walletRes.data.wallet);
      setBookings(bookingsRes.data.bookings || []);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRefund = async (method) => {
    if (!refundModal) return;
    setRefunding(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await apiClient.post("/bookings/refund", {
        bookingId: refundModal._id,
        method,
      });
      setSuccess(data.message);
      setRefundModal(null);
      await loadData();
    } catch (err) {
      setError(err.response?.data?.message || "Refund failed");
    } finally {
      setRefunding(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat("en-PK", {
      style: "currency",
      currency: "PKR",
      minimumFractionDigits: 0,
    }).format(Math.abs(amount));
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isWithinRefundWindow = (booking) => {
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const age = Date.now() - new Date(booking.createdAt).getTime();
    return age < THREE_DAYS;
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <p style={{ color: "var(--muted)" }}>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="buyer-dashboard-page" style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div className="buyer-dashboard__masthead" style={{ marginBottom: 40 }}>
        <h1 style={{ color: "var(--paper)", fontSize: 36, margin: "0 0 8px" }}>
          My Dashboard
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 15 }}>
          Manage your bookings, wallet, and refunds
        </p>
      </div>

      {/* Error / Success Messages */}
      {error && (
        <div style={{
          background: "#fce8e6",
          color: "#c01e1e",
          padding: "12px 16px",
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 14,
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          background: "#e6f7e6",
          color: "#1a7d1a",
          padding: "12px 16px",
          borderRadius: 8,
          marginBottom: 20,
          fontSize: 14,
        }}>
          {success}
        </div>
      )}

      {/* Wallet Card */}
      <div className="buyer-dashboard__wallet" style={{
        background: "linear-gradient(135deg, #192436 0%, #2a3148 100%)",
        borderRadius: 16,
        padding: "28px 32px",
        marginBottom: 32,
        border: "1px solid rgba(201, 154, 60, 0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <Wallet size={20} color="#c99a3c" />
              <h2 style={{ color: "#f7f2e7", margin: 0, fontSize: 18, fontWeight: 600 }}>My Wallet</h2>
            </div>
            <p style={{ color: "#f7f2e7", opacity: 0.6, margin: 0, fontSize: 13 }}>
              Store credit for refunds and purchases
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{
              color: "#c99a3c",
              fontSize: 36,
              fontWeight: 700,
              margin: 0,
              fontFamily: "monospace",
            }}>
              {wallet ? formatCurrency(wallet.balance) : "Rs. 0"}
            </p>
            <p style={{ color: "#f7f2e7", opacity: 0.6, fontSize: 13, margin: "4px 0 0" }}>
              {wallet?.currency || "PKR"} Available Balance
            </p>
          </div>
        </div>

        {/* Transaction History */}
        {wallet?.transactions?.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <p style={{ color: "#c99a3c", fontSize: 13, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Recent Transactions
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {wallet.transactions.slice(0, 5).map((tx) => (
                <div key={tx._id} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 18 }}>
                      {tx.type === "credit" || tx.type === "refund" ? "💰" : "🎫"}
                    </span>
                    <div>
                      <p style={{ margin: 0, color: "#f7f2e7", fontSize: 13, fontWeight: 500 }}>
                        {tx.description?.length > 40 ? tx.description.substring(0, 40) + "..." : tx.description}
                      </p>
                      <p style={{ margin: "2px 0 0", color: "#f7f2e7", opacity: 0.5, fontSize: 11 }}>
                        {formatDate(tx.createdAt)}
                      </p>
                    </div>
                  </div>
                  <span style={{
                    color: tx.amount > 0 ? "#4ade80" : "#f87171",
                    fontWeight: 600,
                    fontSize: 14,
                    fontFamily: "monospace",
                  }}>
                    {tx.amount > 0 ? "+" : ""}{formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {(!wallet?.transactions || wallet.transactions.length === 0) && (
          <p style={{ color: "#f7f2e7", opacity: 0.4, fontSize: 14, textAlign: "center", padding: 16 }}>
            No transactions yet. Refunds will appear here.
          </p>
        )}
      </div>

      {/* My Bookings */}
      <div className="buyer-dashboard__bookings">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Ticket size={20} color="#c99a3c" />
          <h2 style={{ color: "var(--paper)", margin: 0, fontSize: 22, fontWeight: 600 }}>
            My Bookings
          </h2>
          <span style={{
            background: "var(--gold)",
            color: "var(--paper)",
            padding: "2px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
          }}>
            {bookings.length}
          </span>
        </div>

        {bookings.length === 0 ? (
          <div className="buyer-dashboard__empty" style={{
            textAlign: "center",
            padding: 40,
            background: "var(--card)",
            borderRadius: 12,
            border: "1px solid var(--border)",
          }}>
            <Ticket size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <p style={{ color: "var(--muted)", fontSize: 15, margin: 0 }}>
              No bookings found
            </p>
            <Link to="/browse" style={{ color: "var(--gold)", fontSize: 14, marginTop: 8, display: "inline-block" }}>
              Browse Events →
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {bookings.map((booking) => {
              const event = booking.eventId || {};
              const venue = event.venueId || {};
              const canRefund = booking.status === "confirmed" && isWithinRefundWindow(booking);

              return (
                <div key={booking._id} className="buyer-dashboard__booking" style={{
                  background: "var(--card)",
                  borderRadius: 12,
                  padding: "18px 20px",
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <h3 style={{ margin: 0, color: "var(--paper)", fontSize: 16, fontWeight: 600 }}>
                        {event.name || "Unknown Event"}
                      </h3>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        background: booking.status === "confirmed" ? "#e6f7e6" : booking.status === "refunded" ? "#fff3cd" : "#fce8e6",
                        color: booking.status === "confirmed" ? "#1a7d1a" : booking.status === "refunded" ? "#856404" : "#c01e1e",
                      }}>
                        {booking.status}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13, color: "var(--muted)" }}>
                      <span>📅 {event.dateTime ? formatDate(event.dateTime) : "TBD"}</span>
                      <span>📍 {venue.name || "TBA"}{venue.city ? `, ${venue.city}` : ""}</span>
                      <span>🎫 {booking.items?.reduce((s, i) => s + i.quantity, 0)} tickets</span>
                      <span style={{ color: "var(--gold)", fontWeight: 600 }}>
                        {formatCurrency(booking.totalAmount)}
                      </span>
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted)" }}>
                      Code: {booking.confirmationCode} • {formatDate(booking.createdAt)}
                    </p>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <Link
                      to={`/o/${booking.organizationId?.slug || booking.organizationId}/bookings/${booking._id}/confirmation`}
                      style={{
                        padding: "8px 14px",
                        background: "var(--gold)",
                        color: "var(--paper)",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: "none",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}
                    >
                      View
                    </Link>
                    {canRefund && (
                      <button
                        onClick={() => setRefundModal(booking)}
                        style={{
                          padding: "8px 14px",
                          background: "transparent",
                          color: "#f87171",
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          border: "1px solid #f87171",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Request Refund
                      </button>
                    )}
                    {booking.status === "refunded" && booking.refundInfo && (
                      <span style={{
                        padding: "8px 14px",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: 6,
                        fontSize: 11,
                        color: "var(--muted)",
                        textAlign: "center",
                        whiteSpace: "nowrap",
                      }}>
                        ↩️ {booking.refundInfo.method === "wallet" ? "Wallet" : "Stripe"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Refund Modal */}
      {refundModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          padding: 20,
        }}>
          <div className="buyer-dashboard__modal" style={{
            background: "var(--card)",
            borderRadius: 16,
            padding: "32px 28px",
            maxWidth: 480,
            width: "100%",
            border: "1px solid var(--border)",
            position: "relative",
          }}>
            <button
              onClick={() => setRefundModal(null)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                background: "none",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                fontSize: 20,
              }}
            >
              <X size={20} />
            </button>

            <h3 style={{ color: "var(--paper)", margin: "0 0 6px", fontSize: 20 }}>
              ↩️ Request Refund
            </h3>
            <p style={{ color: "var(--muted)", margin: "0 0 20px", fontSize: 14 }}>
              Booking: {refundModal.eventId?.name || "Event"}<br />
              Amount: {formatCurrency(refundModal.totalAmount)} • {formatDate(refundModal.createdAt)}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Wallet Option */}
              <button
                onClick={() => handleRefund("wallet")}
                disabled={refunding}
                style={{
                  padding: "16px 20px",
                  borderRadius: 12,
                  border: "2px solid rgba(201, 154, 60, 0.4)",
                  background: "rgba(201, 154, 60, 0.08)",
                  cursor: refunding ? "not-allowed" : "pointer",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  transition: "all 0.2s",
                  opacity: refunding ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { if (!refunding) e.currentTarget.style.borderColor = "#c99a3c"; }}
                onMouseLeave={(e) => { if (!refunding) e.currentTarget.style.borderColor = "rgba(201, 154, 60, 0.4)"; }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#c99a3c" }}>
                    💰 Wallet Credit
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                    Receive full amount in wallet • Use for future purchases
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#4ade80" }}>
                    {formatCurrency(refundModal.totalAmount)}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#4ade80" }}>
                    100% refund
                  </p>
                </div>
              </button>

              {/* Stripe Option */}
              <button
                onClick={() => handleRefund("stripe")}
                disabled={refunding}
                style={{
                  padding: "16px 20px",
                  borderRadius: 12,
                  border: "2px solid var(--border)",
                  background: "transparent",
                  cursor: refunding ? "not-allowed" : "pointer",
                  textAlign: "left",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  transition: "all 0.2s",
                  opacity: refunding ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { if (!refunding) e.currentTarget.style.borderColor = "#4a90d9"; }}
                onMouseLeave={(e) => { if (!refunding) e.currentTarget.style.borderColor = "var(--border)"; }}
              >
                <div>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#4a90d9" }}>
                    💳 Stripe Refund
                  </p>
                  <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
                    10% deduction applies • Returns to your card
                  </p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#f7f2e7" }}>
                    {formatCurrency(refundModal.totalAmount * 0.9)}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#f87171" }}>
                    -10% ({formatCurrency(refundModal.totalAmount * 0.1)})
                  </p>
                </div>
              </button>
            </div>

            <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 16, textAlign: "center" }}>
              Refund available within 3 days of purchase
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="buyer-dashboard__footer" style={{ textAlign: "center", marginTop: 40 }}>
        <Link to="/browse" style={{ color: "var(--gold)", fontSize: 14 }}>
          ← Browse More Events
        </Link>
      </div>
    </div>
  );
};

export default BuyerDashboard;
