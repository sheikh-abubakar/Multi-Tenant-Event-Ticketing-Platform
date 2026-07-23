import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import apiClient from "../api/client";

const CheckoutPage = () => {
  const { orgSlug, eventId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
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
  const locationState = location.state || {};
  const useWallet = locationState.useWallet || false;
  const walletDeductionFromState = locationState.walletDeduction || 0;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [cartRes, walletRes] = await Promise.all([
          apiClient.get(`/o/${orgSlug}/cart/${eventId}`),
          apiClient.get("/wallet").catch(() => ({ data: { wallet: { balance: 0 } } })),
        ]);
        if (!cancelled) {
          setCart(cartRes.data.cart);
          setEvent(cartRes.data.event);
          setWalletBalance(walletRes.data.wallet?.balance || 0);
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
  }, [orgSlug, eventId]);

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
          // Without these two, the backend has no idea the buyer opted
          // to pay part of the total with wallet balance — it would
          // silently create a Stripe session for the FULL cart total.
          useWallet,
          walletDeduction,
        },
      );

      const { stripeUrl } = res.data;

      if (stripeUrl) {
        // Redirect to Stripe Checkout
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

  // Calculate wallet deduction
  const walletDeduction = useWallet 
    ? (walletDeductionFromState > 0 ? walletDeductionFromState : Math.min(walletBalance, cartTotal))
    : 0;
  const remainingAfterWallet = Math.max(0, cartTotal - walletDeduction);

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

      {error && (
        <div className="card" style={{ background: "rgba(220, 38, 38, 0.1)", border: "1px solid rgba(220, 38, 38, 0.3)", marginBottom: 16 }}>
          <p style={{ margin: 0, color: "var(--danger)" }}>{error}</p>
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
            {useWallet && walletDeduction > 0 ? (
              <>
                <tr style={{ background: "rgba(201, 154, 60, 0.06)" }}>
                  <td colSpan={2} style={{ padding: "10px 4px", fontSize: 14, color: "var(--muted)" }}>
                    Subtotal ({cart.items.reduce((s, i) => s + Number(i.quantity || 0), 0)} tickets)
                  </td>
                  <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 14, color: "var(--muted)" }}>
                    Rs. {cartTotal}
                  </td>
                </tr>
                <tr>
                  <td colSpan={2} style={{ padding: "10px 4px", fontSize: 14, color: "#4ade80" }}>
                    💰 Wallet Payment
                  </td>
                  <td style={{ padding: "10px 4px", textAlign: "right", fontSize: 14, color: "#4ade80", fontWeight: 600 }}>
                    -Rs. {walletDeduction}
                  </td>
                </tr>
                <tr style={{ borderTop: "2px solid #c99a3c" }}>
                  <td colSpan={2} style={{ padding: "12px 4px", fontWeight: 700, fontSize: 16 }}>Amount to Pay</td>
                  <td style={{ padding: "12px 4px", textAlign: "right", fontWeight: 700, color: "#c99a3c", fontSize: 20 }}>
                    Rs. {remainingAfterWallet}
                  </td>
                </tr>
              </>
            ) : (
              <tr style={{ borderTop: "2px solid #c99a3c" }}>
                <td colSpan={2} style={{ padding: "12px 4px", fontWeight: 700, fontSize: 16 }}>Total</td>
                <td style={{ padding: "12px 4px", textAlign: "right", fontWeight: 700, color: "#c99a3c", fontSize: 20 }}>
                  Rs. {cartTotal}
                </td>
              </tr>
            )}
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
              : `Pay Rs. ${useWallet && walletDeduction > 0 ? remainingAfterWallet : cartTotal} with Card`}
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
