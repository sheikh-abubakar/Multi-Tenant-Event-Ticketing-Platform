import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

const CheckoutPage = () => {
  const { orgSlug, eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [cart, setCart] = useState(null);
  const [event, setEvent] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    buyerName: "",
    buyerEmail: "",
  });
  const [referralStats, setReferralStats] = useState(null); // { availableRewardsCount }
  const [rewardsToApply, setRewardsToApply] = useState(0);

  const locationState = location.state || {};
  const useWallet = locationState.useWallet || false;
  const walletDeductionFromState = locationState.walletDeduction || 0;

  // The referral code captured from ?ref=CODE on event page
  const refCode = sessionStorage.getItem("referralCode") || "";

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const requests = [
          apiClient.get(`/o/${orgSlug}/cart/${eventId}`),
          apiClient.get("/wallet").catch(() => ({ data: { wallet: { balance: 0 } } })),
        ];

        // Load referral stats for logged-in users to show available reward count
        if (user) {
          requests.push(apiClient.get("/referrals/me").catch(() => null));
        }

        const [cartRes, walletRes, referralRes] = await Promise.all(requests);
        if (!cancelled) {
          setCart(cartRes.data.cart);
          setEvent(cartRes.data.event);
          setWalletBalance(walletRes.data.wallet?.balance || 0);
          if (referralRes) {
            setReferralStats(referralRes.data.data);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.response?.data?.message || "Could not load cart.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [orgSlug, eventId, user]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const items = (cart?.items || []).map((item) => item.blockId && item.seatId
        ? { blockId: item.blockId, seatId: item.seatId }
        : { ticketTypeIndex: item.ticketTypeIndex, quantity: item.quantity });

      const res = await apiClient.post(
        `/o/${orgSlug}/events/${eventId}/bookings/checkout`,
        {
          buyerName: form.buyerName,
          buyerEmail: form.buyerEmail,
          items,
          useWallet,
          walletDeduction,
          refCode: refCode || undefined,
          rewardsToApply: rewardsToApply > 0 ? rewardsToApply : undefined,
          // auth service returns `id` (not `_id`) — needed for referral reward discount lookup
          userId: user?.id,
        },
      );

      const { stripeUrl } = res.data;

      if (stripeUrl) {
        // Clear referral code from sessionStorage after successful checkout initiation
        sessionStorage.removeItem("referralCode");
        window.location.href = stripeUrl;
      } else {
        setError("Stripe checkout URL not returned. Please try again.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Checkout failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const cartTotal = (cart?.items || []).reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0,
  );

  // Calculate referral discount
  const maxRewards = Math.min(referralStats?.availableRewardsCount || 0, 5);
  const referralDiscountAmount = Math.round((cartTotal * (rewardsToApply * 10)) / 100);
  const afterReferralDiscount = Math.max(0, cartTotal - referralDiscountAmount);

  // Calculate wallet deduction (applied after referral discount)
  const walletDeduction = useWallet
    ? (walletDeductionFromState > 0 ? walletDeductionFromState : Math.min(walletBalance, afterReferralDiscount))
    : 0;

  const finalAmountDue = Math.max(0, afterReferralDiscount - walletDeduction);

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading checkout…</p>;

  if (error && !submitting) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <p style={{ marginTop: 0 }}>
          <Link to={`/o/${orgSlug}/cart/${eventId}`}>&larr; Back to cart</Link>
        </p>
        <h3 style={{ marginTop: 0, color: "var(--danger)" }}>Checkout error</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!event || !cart || cart.items.length === 0) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <p style={{ marginTop: 0 }}>
          <Link to={`/o/${orgSlug}/events/${eventId}`}>&larr; Back to event</Link>
        </p>
        <h3 style={{ marginTop: 0 }}>Your cart is empty</h3>
        <p style={{ color: "var(--muted)" }}>Add tickets to your cart before proceeding.</p>
      </div>
    );
  }

  return (
    <div className="checkout-page" style={{ maxWidth: 740, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link to={`/o/${orgSlug}/cart/${eventId}`}>&larr; Back to cart</Link>
      </p>

      <div style={styles.topBar}>
        <div>
          <p style={styles.kicker}>Checkout</p>
          <h1 style={{ color: "var(--paper)", margin: "4px 0 0" }}>{event.name}</h1>
        </div>
      </div>

      {/* Referral code badge (when arriving via a friend's link) */}
      {refCode && (
        <div style={styles.refBadge}>
          <span>🎟️ Referred via <strong style={{ color: "var(--gold)" }}>{refCode}</strong></span>
          <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>The sharer earns a 10% reward when you complete this purchase</span>
        </div>
      )}

      {error && (
        <div className="card" style={{ background: "rgba(220, 38, 38, 0.1)", border: "1px solid rgba(220, 38, 38, 0.3)", marginBottom: 16 }}>
          <p style={{ margin: 0, color: "var(--danger)" }}>{error}</p>
        </div>
      )}

      {/* Referral Rewards Selector — only for logged-in users with available rewards */}
      {user && maxRewards > 0 && (
        <div className="card" style={styles.rewardsCard}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 20 }}>🏆</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, color: "#f7f2e7", fontSize: 15 }}>
                You have {maxRewards} referral reward{maxRewards !== 1 ? "s" : ""} available
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "rgba(247, 242, 231, 0.6)" }}>
                Each reward = 10% off. Max 5 rewards (50%) per order.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ fontSize: 13, color: "rgba(247, 242, 231, 0.7)", fontWeight: 600 }}>Apply rewards:</label>
            {[0, ...Array.from({ length: maxRewards }, (_, i) => i + 1)].map((n) => (
              <button
                key={n}
                onClick={() => setRewardsToApply(n)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: rewardsToApply === n ? "2px solid var(--gold)" : "1px solid rgba(247, 242, 231, 0.2)",
                  background: rewardsToApply === n ? "var(--gold)" : "rgba(255, 255, 255, 0.05)",
                  color: rewardsToApply === n ? "#14162b" : "#f7f2e7",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                {n === 0 ? "None" : `${n} (${n * 10}% off)`}
              </button>
            ))}
          </div>

          {rewardsToApply > 0 && (
            <p style={{ margin: "12px 0 0", fontSize: 13, color: "#4ade80", fontWeight: 600 }}>
              🎉 {rewardsToApply * 10}% discount applied → saving Rs. {referralDiscountAmount}
            </p>
          )}
        </div>
      )}

      <div className="card checkout-summary-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Order Summary</h3>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #d8d0bd" }}>
              <th style={{ textAlign: "left", padding: "8px 4px", color: "var(--muted)" }}>Item</th>
              <th style={{ textAlign: "center", padding: "8px 4px", color: "var(--muted)" }}>Qty</th>
              <th style={{ textAlign: "right", padding: "8px 4px", color: "var(--muted)" }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {cart.items.map((item) => (
              <tr key={item.ticketTypeIndex ?? `${item.blockId}:${item.seatId}`} style={{ borderBottom: "1px solid #e8e2d3" }}>
                <td style={{ padding: "10px 4px" }}>{item.ticketTypeName || `${item.sectionName} — ${item.seatName}`}</td>
                <td style={{ padding: "10px 4px", textAlign: "center" }}>{item.quantity}</td>
                <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 700 }}>
                  Rs. {Number(item.unitPrice || 0) * Number(item.quantity || 0)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Subtotal */}
            <tr style={{ background: "rgba(201, 154, 60, 0.04)" }}>
              <td colSpan={2} style={{ padding: "10px 4px", fontSize: 14, color: "var(--muted)" }}>
                Subtotal ({cart.items.reduce((s, i) => s + Number(i.quantity || 0), 0)} tickets)
              </td>
              <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 14, color: "var(--muted)" }}>
                Rs. {cartTotal}
              </td>
            </tr>

            {/* Referral rewards discount row */}
            {rewardsToApply > 0 && (
              <tr>
                <td colSpan={2} style={{ padding: "10px 4px", fontSize: 14, color: "#4ade80" }}>
                  🏆 Referral Rewards ({rewardsToApply * 10}% off)
                </td>
                <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 14, color: "#4ade80", fontWeight: 600 }}>
                  -Rs. {referralDiscountAmount}
                </td>
              </tr>
            )}

            {/* Wallet row */}
            {useWallet && walletDeduction > 0 && (
              <tr>
                <td colSpan={2} style={{ padding: "10px 4px", fontSize: 14, color: "#4ade80" }}>
                  💰 Wallet Payment
                </td>
                <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 14, color: "#4ade80", fontWeight: 600 }}>
                  -Rs. {walletDeduction}
                </td>
              </tr>
            )}

            {/* Final total */}
            <tr style={{ borderTop: "2px solid #c99a3c" }}>
              <td colSpan={2} style={{ padding: "12px 4px", fontWeight: 700, fontSize: 16 }}>Amount to Pay</td>
              <td style={{ padding: "12px 4px", textAlign: "right", fontWeight: 700, color: "#c99a3c", fontSize: 20 }}>
                Rs. {finalAmountDue}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="card checkout-buyer-card">
        <h3 style={{ marginTop: 0 }}>Buyer Information</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              name="buyerName"
              value={form.buyerName}
              onChange={handleChange}
              required
              placeholder="e.g. John Doe"
              style={styles.input}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              name="buyerEmail"
              value={form.buyerEmail}
              onChange={handleChange}
              required
              placeholder="e.g. john@example.com"
              style={styles.input}
            />
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>
              Your tickets and QR code will be sent to this address.
            </p>
          </div>

          <button
            type="submit"
            style={{
              ...styles.checkoutBtn,
              opacity: submitting ? 0.6 : 1,
            }}
            disabled={submitting}
          >
            {submitting
              ? "Processing…"
              : `Pay Rs. ${finalAmountDue} with Card`}
          </button>

          <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            You will be redirected to Stripe's secure checkout page.
          </p>
        </form>
      </div>
    </div>
  );
};

const styles = {
  topBar: {
    marginBottom: 20,
  },
  kicker: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: 12,
    color: "var(--muted)",
  },
  refBadge: {
    padding: "10px 16px",
    borderRadius: 10,
    background: "rgba(201,154,60,0.1)",
    border: "1px solid rgba(201,154,60,0.3)",
    marginBottom: 16,
    fontSize: 13,
    color: "var(--paper)",
    display: "flex",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  rewardsCard: {
    marginBottom: 16,
    background: "linear-gradient(135deg, rgba(201, 154, 60, 0.15), rgba(20, 22, 43, 0.95))",
    border: "1px solid rgba(201, 154, 60, 0.3)",
    color: "#f7f2e7",
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--paper)",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #d8d0bd",
    background: "#fffdf8",
    color: "#1e2030",
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  },
  checkoutBtn: {
    display: "block",
    width: "100%",
    padding: "14px 24px",
    background: "var(--gold)",
    color: "var(--navy)",
    border: "none",
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
};

export default CheckoutPage;
