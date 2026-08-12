import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function BundleCheckoutPage() {
  const { orgSlug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const bundleId = searchParams.get("bundleId");
  const qty = Number(searchParams.get("qty") || 2);
  const { user } = useAuth();

  const selectedSessionIds = location.state?.selectedSessionIds || {};

  const [bundle, setBundle] = useState(null);
  const [eventCarts, setEventCarts] = useState({}); // eventId -> cart items
  const [walletBalance, setWalletBalance] = useState(0);
  const [referralStats, setReferralStats] = useState(null);
  const [rewardsToApply, setRewardsToApply] = useState(0);

  // Coupon states
  const [couponInput, setCouponInput] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    buyerName: "",
    buyerEmail: "",
  });

  const [useWallet, setUseWallet] = useState(false);

  const refCode = sessionStorage.getItem("referralCode") || "";

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      setError("");
      try {
        // 1. Fetch Bundle details
        const bundleRes = await apiClient.get(`/o/${orgSlug}/bundles/${bundleId}`);
        const bundleData = bundleRes.data.bundle;
        setBundle(bundleData);

        // 2. Fetch all event carts in this bundle
        const carts = {};
        for (const event of bundleData.eventIds) {
          const sessionId = selectedSessionIds[event._id] || "";
          const cartRes = await apiClient.get(`/o/${orgSlug}/cart/${event._id}?sessionId=${sessionId}`, { params: { bundleId } });
          carts[event._id] = cartRes.data.cart.items || [];
        }
        setEventCarts(carts);

        // 3. Fetch wallet and referral stats if logged in
        let walletBalanceVal = 0;
        let refStatsVal = null;
        if (user) {
          const [walletRes, referralRes] = await Promise.all([
            apiClient.get("/wallet").catch(() => ({ data: { wallet: { balance: 0 } } })),
            apiClient.get("/referrals/me").catch(() => null),
          ]);
          walletBalanceVal = walletRes?.data?.wallet?.balance || 0;
          refStatsVal = referralRes?.data?.data || null;

          setForm({
            buyerName: user.name || "",
            buyerEmail: user.email || "",
          });
        }
        setWalletBalance(walletBalanceVal);
        setReferralStats(refStatsVal);
      } catch (err) {
        setError(err.response?.data?.message || "Could not load checkout details.");
      } finally {
        setLoading(false);
      }
    };
    if (bundleId) loadData();
  }, [orgSlug, bundleId, user]);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleApplyCoupon = async () => {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res = await apiClient.post(`/o/${orgSlug}/coupons/validate`, {
        code: couponInput.trim(),
        bundleId,
        originalTotal: cartTotal,
      });
      setAppliedCoupon(res.data.data);
      setRewardsToApply(0); // clear referral rewards (no-stacking)
    } catch (err) {
      setCouponError(err.response?.data?.message || "Invalid coupon code");
      setAppliedCoupon(null);
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput("");
    setCouponError("");
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      // Structure selections: eventId -> array of { blockId, seatId }
      const selections = {};
      Object.entries(eventCarts).forEach(([eventId, items]) => {
        selections[eventId] = items.map(item => ({ blockId: item.blockId, seatId: item.seatId }));
      });

      const res = await apiClient.post(`/o/${orgSlug}/bundles/${bundleId}/checkout`, {
        buyerName: form.buyerName,
        buyerEmail: form.buyerEmail,
        selections,
        selectedSessionIds,
        useWallet,
        walletDeduction: useWallet ? walletDeduction : 0,
        refCode: refCode || undefined,
        rewardsToApply: rewardsToApply > 0 ? rewardsToApply : undefined,
        couponCode: appliedCoupon?.code || undefined,
        userId: user?.id,
      });

      const { stripeUrl, success, confirmationUrl } = res.data;
      if (stripeUrl) {
        sessionStorage.removeItem("referralCode");
        window.location.href = stripeUrl;
      } else if (success && confirmationUrl) {
        sessionStorage.removeItem("referralCode");
        window.location.href = confirmationUrl;
      } else {
        setError("Stripe checkout session creation failed.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Checkout failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Compute pricing — bundle price × qty (seats per event), not per total seat count
  // pricePerSeat is actually the per-bundle price for ONE seat quantity slot
  const cartTotal = (bundle?.pricePerSeat || 0) * qty;

  // Referral discount
  const maxRewards = Math.min(referralStats?.availableRewardsCount || 0, 5);
  const referralDiscountAmount = !appliedCoupon ? Math.round((cartTotal * (rewardsToApply * 10)) / 100) : 0;
  const couponDiscountAmount = appliedCoupon ? appliedCoupon.discountAmount : 0;

  const totalDiscount = referralDiscountAmount + couponDiscountAmount;
  const afterDiscount = Math.max(0, cartTotal - totalDiscount);

  // Wallet deduction
  const walletDeduction = useWallet ? Math.min(walletBalance, afterDiscount) : 0;
  const finalAmountDue = Math.max(0, afterDiscount - walletDeduction);

  if (loading) return <p style={{ color: "var(--muted)", padding: 40, textAlign: "center" }}>Loading bundle checkout…</p>;

  if (error && !submitting) {
    return (
      <div className="card" style={{ maxWidth: 640, margin: "40px auto" }}>
        <h3 style={{ color: "var(--danger)" }}>Checkout Error</h3>
        <p>{error}</p>
        <Link to={`/o/${orgSlug}/bundles/${bundleId}`} className="btn btn-primary">Back to bundle</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 740, margin: "0 auto", padding: "20px 4px" }}>
      <p style={{ marginBottom: 16 }}>
        <Link to={`/o/${orgSlug}/bundles/${bundleId}/seats?qty=${qty}`} style={{ color: "var(--gold)", textDecoration: "none" }}>
          ← Back to seat selection
        </Link>
      </p>

      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#c99a3c", letterSpacing: "0.15em", textTransform: "uppercase" }}>Bundle Checkout</span>
        <h1 className="display" style={{ margin: "4px 0 0" }}>{bundle?.name}</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 24, alignItems: "start" }}>
        {/* Left: form */}
        <form onSubmit={handleCheckoutSubmit} className="card" style={{ display: "grid", gap: 20 }}>
          <h3 style={{ margin: 0, color: "#f7f2e7" }}>Buyer Information</h3>
          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Full Name *</label>
            <input
              type="text"
              name="buyerName"
              required
              value={form.buyerName}
              onChange={handleChange}
              placeholder="e.g. John Doe"
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid rgba(247,242,231,0.15)", background: "rgba(0,0,0,0.2)", color: "#fff" }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>Email Address *</label>
            <input
              type="email"
              name="buyerEmail"
              required
              value={form.buyerEmail}
              onChange={handleChange}
              placeholder="e.g. john@example.com"
              style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid rgba(247,242,231,0.15)", background: "rgba(0,0,0,0.2)", color: "#fff" }}
            />
          </div>

          {/* Wallet Toggle */}
          {user && walletBalance > 0 && (
            <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(247,242,231,0.03)", border: "1px solid rgba(247,242,231,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>Pay with Wallet Balance</p>
                <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>Available: ${walletBalance.toFixed(2)}</p>
              </div>
              <input
                type="checkbox"
                checked={useWallet}
                onChange={(e) => setUseWallet(e.target.checked)}
                style={{ width: 20, height: 20, cursor: "pointer" }}
              />
            </div>
          )}

          {/* Referral Rewards */}
          {user && maxRewards > 0 && !appliedCoupon && (
            <div style={{ padding: "14px 18px", borderRadius: 12, background: "rgba(247,242,231,0.03)", border: "1px solid rgba(247,242,231,0.06)" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>Apply Referral Rewards</p>
              <p style={{ margin: "2px 0 10px", fontSize: 12, color: "var(--muted)" }}>You have {maxRewards} rewards available. Apply up to 5 for 10% off each.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  onClick={() => setRewardsToApply(r => Math.max(0, r - 1))}
                  style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid rgba(247,242,231,0.15)", background: "rgba(247,242,231,0.05)", color: "#fff", cursor: "pointer" }}
                >
                  −
                </button>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{rewardsToApply} reward(s) ({rewardsToApply * 10}%)</span>
                <button
                  type="button"
                  onClick={() => setRewardsToApply(r => Math.min(maxRewards, r + 1))}
                  style={{ width: 30, height: 30, borderRadius: 6, border: "1px solid rgba(247,242,231,0.15)", background: "rgba(247,242,231,0.05)", color: "#fff", cursor: "pointer" }}
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Coupon Input */}
          <div style={{ padding: "14px 18px", borderRadius: 12, background: "linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(20, 22, 43, 0.95))", border: "1px solid rgba(99, 102, 241, 0.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>🎫 Discount Coupon</span>
              {appliedCoupon && (
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  style={{ background: "transparent", border: "none", color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
                >
                  Remove
                </button>
              )}
            </div>
            {appliedCoupon ? (
              <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(74, 222, 128, 0.08)", border: "1px solid rgba(74, 222, 128, 0.2)", display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14, color: "#4ade80", fontWeight: 700 }}>✓ Code Applied: {appliedCoupon.code}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>({appliedCoupon.discountType === "percentage" ? `${appliedCoupon.discountValue}%` : `$${appliedCoupon.discountValue}`} discount)</span>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="ENTER CODE (e.g. BUNDLESAVE)"
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      borderRadius: 8,
                      border: "1px solid rgba(247, 242, 231, 0.2)",
                      background: "rgba(255, 255, 255, 0.05)",
                      color: "#f7f2e7",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={couponLoading || !couponInput.trim()}
                    style={{
                      padding: "9px 16px",
                      background: "var(--gold)",
                      color: "var(--navy)",
                      border: "none",
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: "pointer",
                      opacity: (couponLoading || !couponInput.trim()) ? 0.6 : 1,
                    }}
                  >
                    {couponLoading ? "Checking..." : "Apply"}
                  </button>
                </div>
                {couponError && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#f87171", fontWeight: 600 }}>
                    ❌ {couponError}
                  </p>
                )}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary"
            style={{ padding: "12px 24px", fontSize: 15, fontWeight: 800, background: "#c99a3c", color: "#14162b" }}
          >
            {submitting ? "Processing..." : `Pay $${finalAmountDue.toFixed(2)} →`}
          </button>
        </form>

        {/* Right: order details summary */}
        <aside className="card" style={{ padding: 18, background: "rgba(20, 22, 43, 0.4)" }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, color: "#f7f2e7" }}>Order Summary</h3>
          <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
            {bundle?.eventIds?.map(event => (
              <div key={event._id} style={{ fontSize: 13, borderBottom: "1px dashed rgba(247,242,231,0.08)", paddingBottom: 8 }}>
                <div style={{ fontWeight: 600, color: "#f7f2e7" }}>{event.name}</div>
                <div style={{ color: "var(--muted)", fontSize: 11 }}>{qty} seat(s) reserved in this event</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
            <span style={{ color: "var(--muted)" }}>Bundle price</span>
            <span>${(bundle?.pricePerSeat || 0).toFixed(2)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
            <span style={{ color: "var(--muted)" }}>× {qty} seat{qty !== 1 ? "s" : ""}</span>
            <span style={{ fontWeight: 700 }}>${cartTotal.toFixed(2)}</span>
          </div>

          {referralDiscountAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#4ade80", marginBottom: 8 }}>
              <span>Referral Discount</span>
              <span>−${referralDiscountAmount.toFixed(2)}</span>
            </div>
          )}

          {couponDiscountAmount > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#4ade80", marginBottom: 8 }}>
              <span>Coupon ({appliedCoupon.code})</span>
              <span>−${couponDiscountAmount.toFixed(2)}</span>
            </div>
          )}

          {walletDeduction > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "#4ade80", marginBottom: 8 }}>
              <span>Wallet Paid</span>
              <span>−${walletDeduction.toFixed(2)}</span>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, borderTop: "1px solid rgba(247,242,231,0.15)", paddingTop: 12, color: "#c99a3c" }}>
            <span>Amount Due</span>
            <span>${finalAmountDue.toFixed(2)}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
