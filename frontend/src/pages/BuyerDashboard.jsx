import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Wallet, Ticket, ArrowLeft, Clock, X, Gift } from "lucide-react";
import apiClient from "../api/client";
import "./BuyerDashboard.css";

const buildBookingDisplayItems = (bookings) => {
  const items = [];
  const bundles = new Map();

  bookings.forEach((booking) => {
    if (!booking.isBundleBooking || !booking.bundleBookingId) {
      items.push({ type: "event", key: booking._id, booking, bookings: [booking] });
      return;
    }

    const bundleKey = String(booking.bundleBookingId);
    const existing = bundles.get(bundleKey);
    if (existing) existing.bookings.push(booking);
    else bundles.set(bundleKey, { type: "bundle", key: `bundle-${bundleKey}`, booking, bookings: [booking] });
  });

  bundles.forEach((bundle) => items.push(bundle));
  return items.sort((left, right) => new Date(right.booking.createdAt) - new Date(left.booking.createdAt));
};

const BuyerDashboard = ({ bookingsOnly = false }) => {
  const [wallet, setWallet] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [referralData, setReferralData] = useState(null);
  const [seatChangeRequests, setSeatChangeRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [refundModal, setRefundModal] = useState(null); // booking object or null
  const [refunding, setRefunding] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [bookingFilter, setBookingFilter] = useState("all");

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [walletRes, bookingsRes, referralRes, seatChangeRes] = await Promise.all([
        apiClient.get("/wallet"),
        apiClient.get("/bookings/mine"),
        apiClient.get("/referrals/me").catch(() => null),
        apiClient.get("/seat-change/my").catch(() => ({ data: { requests: [] } })),
      ]);
      setWallet(walletRes.data.wallet);
      setBookings(bookingsRes.data.bookings || []);
      if (referralRes) setReferralData(referralRes.data.data);
      setSeatChangeRequests(seatChangeRes.data.requests || []);
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
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
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

  const displayBookings = buildBookingDisplayItems(bookings);
  const visibleBookings = displayBookings.filter((item) => {
    const status = item.type === "bundle"
      ? (item.bookings.every((booking) => booking.status === "refunded") ? "refunded" : "confirmed")
      : item.booking.status;
    return bookingFilter === "all" || status === bookingFilter;
  });

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <p style={{ color: "var(--muted)" }}>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className={`buyer-dashboard-page${bookingsOnly ? " buyer-dashboard--bookings" : ""}`} style={{ maxWidth: 900, margin: "0 auto" }}>
      {/* Header */}
      <div className="buyer-dashboard__masthead" style={{ marginBottom: 40 }}>
        <Link to="/browse" className="buyer-dashboard__back" aria-label="Back to browse events">
          <ArrowLeft size={15} /> Back to browse
        </Link>
        <h1 style={{ color: "var(--paper)", fontSize: 36, margin: "0 0 8px" }}>
          {bookingsOnly ? "My Bookings" : "My Dashboard"}
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 15 }}>
          {bookingsOnly ? "Review tickets, refunds, and seat change requests" : "Manage your bookings, wallet, and refunds"}
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
              {wallet ? formatCurrency(wallet.balance) : "$0.00"}
            </p>
            <p style={{ color: "#f7f2e7", opacity: 0.6, fontSize: 13, margin: "4px 0 0" }}>
              {wallet?.currency || "USD"} Available Balance
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

      {/* Referrals & Rewards Card */}
      {referralData && (
        <div className="buyer-dashboard__referrals" style={{
          background: "linear-gradient(135deg, rgba(201,154,60,0.07), rgba(25,36,54,0.85))",
          borderRadius: 16,
          padding: "28px 32px",
          marginBottom: 32,
          border: "1px solid rgba(201,154,60,0.25)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20, flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Gift size={20} color="#c99a3c" />
                <h2 style={{ color: "#f7f2e7", margin: 0, fontSize: 18, fontWeight: 600 }}>Referrals &amp; Rewards</h2>
              </div>
              <p style={{ color: "#f7f2e7", opacity: 0.6, margin: 0, fontSize: 13 }}>
                Share events, earn 10% discount rewards (up to 50% per checkout)
              </p>
            </div>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "#4ade80", fontSize: 28, fontWeight: 700, margin: 0, fontFamily: "monospace" }}>
                  {referralData.availableRewardsCount}
                </p>
                <p style={{ color: "#f7f2e7", opacity: 0.5, fontSize: 12, margin: "4px 0 0" }}>Available</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ color: "#c99a3c", fontSize: 28, fontWeight: 700, margin: 0, fontFamily: "monospace" }}>
                  {referralData.totalEarnedCount}
                </p>
                <p style={{ color: "#f7f2e7", opacity: 0.5, fontSize: 12, margin: "4px 0 0" }}>Total Earned</p>
              </div>
            </div>
          </div>

          {/* Referral code + copy link */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ color: "#c99a3c", fontSize: 12, fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Your Referral Code</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{ background: "rgba(255,255,255,0.08)", padding: "8px 14px", borderRadius: 8, color: "#f7f2e7", fontSize: 16, fontWeight: 700, letterSpacing: "0.05em" }}>
                {referralData.referralCode}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/browse?ref=${referralData.referralCode}`
                  ).then(() => {
                    setReferralCopied(true);
                    setTimeout(() => setReferralCopied(false), 2000);
                  });
                }}
                style={{ padding: "8px 16px", background: "var(--gold)", color: "var(--navy)", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                {referralCopied ? "✓ Copied!" : "📋 Copy Link"}
              </button>
            </div>
          </div>

          {/* Available rewards */}
          {referralData.availableRewards?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: "#4ade80", fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Available Rewards</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {referralData.availableRewards.slice(0, 5).map((reward) => (
                  <div key={reward._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(74,222,128,0.07)", borderRadius: 8, border: "1px solid rgba(74,222,128,0.15)" }}>
                    <span style={{ color: "#f7f2e7", fontSize: 13 }}>🎁 Friend: <strong>{reward.referredEmail}</strong></span>
                    <span style={{ color: "#4ade80", fontWeight: 700, fontSize: 13 }}>+{reward.discountPercent}% off</span>
                  </div>
                ))}
                {referralData.availableRewards.length > 5 && (
                  <p style={{ color: "#f7f2e7", opacity: 0.5, fontSize: 12, textAlign: "center", margin: 0 }}>+{referralData.availableRewards.length - 5} more rewards</p>
                )}
              </div>
            </div>
          )}

          {/* Used rewards history */}
          {referralData.usedRewardsHistory?.length > 0 && (
            <div>
              <p style={{ color: "#c99a3c", fontSize: 12, fontWeight: 600, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Used Rewards</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {referralData.usedRewardsHistory.slice(0, 3).map((reward) => (
                  <div key={reward._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
                    <span style={{ color: "#f7f2e7", opacity: 0.6, fontSize: 13 }}>✓ Friend: {reward.referredEmail}</span>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>Used</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {referralData.availableRewardsCount === 0 && referralData.totalEarnedCount === 0 && (
            <p style={{ color: "#f7f2e7", opacity: 0.4, fontSize: 14, textAlign: "center", padding: "12px 0 0" }}>
              No rewards yet. Share your code on any event page and earn 10% off every time a friend buys!
            </p>
          )}
        </div>
      )}

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
             {displayBookings.length}
          </span>
        </div>

        {bookingsOnly && displayBookings.length > 0 && (
          <div className="buyer-booking-filters" aria-label="Filter bookings by status">
            {["all", "confirmed", "refunded"].map((status) => (
              <button key={status} type="button" className={bookingFilter === status ? "is-active" : ""} onClick={() => setBookingFilter(status)}>
                {status[0].toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        )}

        {displayBookings.length === 0 || visibleBookings.length === 0 ? (
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
            {visibleBookings.map((displayItem) => {
              const isBundle = displayItem.type === "bundle";
              const booking = displayItem.booking;
              const bundleBookings = displayItem.bookings;
              const bundle = isBundle ? (booking.bundleId || {}) : null;
              const event = booking.eventId || {};
              const venue = event.venueId || {};
              const canRefund = !isBundle && booking.status === "confirmed" && isWithinRefundWindow(booking);
              const displayStatus = isBundle
                ? (bundleBookings.every((component) => component.status === "refunded") ? "refunded" : "confirmed")
                : booking.status;
              const ticketCount = bundleBookings.reduce(
                (total, component) => total + (component.items?.reduce((sum, item) => sum + item.quantity, 0) || 0),
                0,
              );
              const totalAmount = bundleBookings.reduce((total, component) => total + Number(component.totalAmount || 0), 0);
              const relatedBookingIds = new Set(bundleBookings.map((component) => String(component._id)));

              return (
                <div key={displayItem.key} className="buyer-dashboard__booking" style={{
                  background: "var(--card)",
                  borderRadius: 12,
                  padding: "18px 20px",
                  border: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 16,
                }}>
                  <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 14 }}>
                    {isBundle && bundle?.bannerImageUrl && (
                      <img
                        src={bundle.bannerImageUrl}
                        alt={bundle.name || booking.bundleName || "Event bundle"}
                        style={{ width: 74, height: 74, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)", flexShrink: 0 }}
                      />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <h3 style={{ margin: 0, color: "var(--paper)", fontSize: 16, fontWeight: 600 }}>
                        {isBundle ? (bundle?.name || booking.bundleName || "Event Bundle") : (event.name || "Unknown Event")}
                      </h3>
                      <span style={{
                        padding: "2px 8px",
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        background: displayStatus === "confirmed" ? "#e6f7e6" : displayStatus === "refunded" ? "#fff3cd" : "#fce8e6",
                        color: displayStatus === "confirmed" ? "#1a7d1a" : displayStatus === "refunded" ? "#856404" : "#c01e1e",
                      }}>
                        {displayStatus}
                      </span>
                    </div>
                    {isBundle && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13, color: "var(--muted)" }}>
                        <span>{bundleBookings.length} included events</span>
                        <span>View event venues and QR tickets</span>
                        <span>{ticketCount} tickets</span>
                        <span style={{ color: "var(--gold)", fontWeight: 600 }}>{formatCurrency(totalAmount)}</span>
                      </div>
                    )}
                    {!isBundle && (<div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13, color: "var(--muted)" }}>
                      <span>📅 {booking.eventDateTime ? formatDate(booking.eventDateTime) : event.dateTime ? formatDate(event.dateTime) : "TBD"}</span>
                      <span>📍 {venue.name || "TBA"}{venue.city ? `, ${venue.city}` : ""}</span>
                      <span>🎫 {booking.items?.reduce((s, i) => s + i.quantity, 0)} tickets</span>
                      <span style={{ color: "var(--gold)", fontWeight: 600 }}>
                        {formatCurrency(booking.totalAmount)}
                      </span>
                    </div>)}
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted)" }}>
                      {isBundle && <>Bundle purchase • {bundleBookings.length} events • {formatDate(booking.createdAt)}<br /></>}
                      Code: {booking.confirmationCode} • {formatDate(booking.createdAt)}
                    </p>

                    {/* Associated Seat Change Requests */}
                    {(() => {
                      const myRequests = seatChangeRequests.filter(
                        (r) => relatedBookingIds.has(String(r.bookingId?._id || r.bookingId))
                      );
                      if (myRequests.length === 0) return null;
                      return (
                        <div style={{ marginTop: 10, padding: "8px 12px", background: "rgba(201, 154, 60, 0.05)", borderLeft: "3px solid var(--gold)", borderRadius: 6 }}>
                          {myRequests.map((req) => (
                            <div key={req._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, gap: 10, color: "var(--paper)" }}>
                              <span>
                                🔄 Seat Change: <strong>{req.oldSeat?.seatName}</strong> &rarr; <strong style={{ color: "#10b981" }}>{req.newSeat?.seatName}</strong>
                              </span>
                              <span style={{
                                fontWeight: 700,
                                textTransform: "uppercase",
                                fontSize: 9,
                                padding: "2px 6px",
                                borderRadius: 4,
                                background: req.status === "approved" ? "rgba(16, 185, 129, 0.15)" : req.status === "rejected" ? "rgba(239, 68, 68, 0.15)" : "rgba(252, 196, 62, 0.15)",
                                color: req.status === "approved" ? "#10b981" : req.status === "rejected" ? "#ef4444" : "#fcc43e",
                                whiteSpace: "nowrap"
                              }}>
                                {req.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
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
                      {isBundle ? "View Bundle" : "View"}
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

      {/* Seat Change Requests */}
      <div className="buyer-dashboard__bookings" style={{ marginTop: 40 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Clock size={20} color="#c99a3c" />
          <h2 style={{ color: "var(--paper)", margin: 0, fontSize: 22, fontWeight: 600 }}>
            Seat Change Requests
          </h2>
          <span style={{
            background: "var(--gold)",
            color: "var(--paper)",
            padding: "2px 10px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 600,
          }}>
            {seatChangeRequests.length}
          </span>
        </div>

        {seatChangeRequests.length === 0 ? (
          <div className="buyer-dashboard__empty" style={{
            textAlign: "center",
            padding: 40,
            background: "var(--card)",
            borderRadius: 12,
            border: "1px solid var(--border)",
          }}>
            <Clock size={32} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
            <p style={{ color: "var(--muted)", fontSize: 15, margin: 0 }}>
              No seat change requests found
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {seatChangeRequests.map((req) => {
              const event = req.eventId || {};
              const isCheaper = req.priceDifference < 0;
              const isPriceEqual = req.priceDifference === 0;

              return (
                <div key={req._id} className="buyer-dashboard__booking" style={{
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
                        background: req.status === "approved" ? "#e6f7e6" : req.status === "rejected" ? "#fce8e6" : "#fff3cd",
                        color: req.status === "approved" ? "#1a7d1a" : req.status === "rejected" ? "#c01e1e" : "#856404",
                      }}>
                        {req.status}
                      </span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 13, color: "var(--muted)", alignItems: "center" }}>
                      <span>Swap: <strong>{req.oldSeat?.seatName}</strong> &rarr; <strong style={{ color: "#10b981" }}>{req.newSeat?.seatName}</strong></span>
                      <span>• Difference: 
                        <strong style={{ color: isCheaper ? "#10b981" : isPriceEqual ? "inherit" : "var(--gold)" }}>
                          {isCheaper ? ` Refund $${Math.abs(req.priceDifference).toFixed(2)}` : isPriceEqual ? " $0.00" : ` +$${req.priceDifference.toFixed(2)}`}
                        </strong>
                      </span>
                      <span>• Payment: {req.paymentStatus}</span>
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--muted)" }}>
                      Submitted: {formatDate(req.createdAt)}
                    </p>

                    {req.paymentStatus === "pending" && req.status === "pending" && (
                      <button
                        onClick={async () => {
                          try {
                            const orgSlug = req.bookingId?.organizationId?.slug || req.bookingId?.organizationId || "dev";
                            await apiClient.post(`/o/${orgSlug}/seat-change/requests/${req._id}/dev-simulate-pay`);
                            setSuccess("⚡ Offline dev payment simulated successfully! Reloading...");
                            setTimeout(() => {
                              setSuccess("");
                              loadData();
                            }, 1500);
                          } catch (err) {
                            setError(err.response?.data?.message || "Failed to simulate payment.");
                          }
                        }}
                        style={{
                          marginTop: 10,
                          padding: "6px 12px",
                          background: "var(--gold)",
                          color: "var(--ink)",
                          border: "none",
                          borderRadius: 6,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center"
                        }}
                      >
                        ⚡ Simulate Stripe Payment (Dev Mode)
                      </button>
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
