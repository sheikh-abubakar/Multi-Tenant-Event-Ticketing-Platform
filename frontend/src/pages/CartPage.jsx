import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import { useAuth } from "../context/AuthContext";
import { getLocalCart, setLocalCart, serverUnlockSeat, serverClearCart, getCartId, fetchCart } from "../utils/cart";
import { Ticket, ShoppingBag, Trash2, Pencil, ShieldCheck, Mail, User as UserIcon, Timer, Tag } from "lucide-react";
import "./CartPage.css";

export default function CartPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [cartItems, setCartItems] = useState([]);
  const [eventDetails, setEventDetails] = useState({});
  const [checkoutOrgSlug, setCheckoutOrgSlug] = useState("");
  const [bundleDetails, setBundleDetails] = useState({});
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  // Form states
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [useWallet, setUseWallet] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [couponApplied, setCouponApplied] = useState("");
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponDiscountsByItem, setCouponDiscountsByItem] = useState({});
  const [rewardsToApply, setRewardsToApply] = useState(0);
  const [walletDeduction, setWalletDeduction] = useState(0);

  // Expiry / Countdown State
  const [expiresAt, setExpiresAt] = useState(null);
  const [timeLeft, setTimeLeft] = useState("");

  const loadCartData = async () => {
    setLoading(true);
    setError("");
    try {
      let items = await fetchCart();

      // Editing temporarily expands a bundle into its held seat selections.
      // When the buyer returns to Cart with a complete selection, immediately
      // fold those holds back into the one payable bundle item.
      const draftBundleItems = [...new Map(
        items
          .filter((item) => item.itemType !== "bundle" && item.bundleId)
          .map((item) => [String(item.bundleId), item])
      ).values()];
      for (const draftItem of draftBundleItems) {
        try {
          const eventRes = await apiClient.get(`/events/public/${draftItem.eventId}`);
          const orgSlug = eventRes.data.event?.organizationId?.slug;
          if (!orgSlug) continue;
          const finalizeRes = await apiClient.post(`/o/${orgSlug}/bundles/${draftItem.bundleId}/cart`, {}, {
            headers: { "X-Cart-Id": getCartId() },
          });
          if (finalizeRes.data.cart?.items) {
            items = finalizeRes.data.cart.items;
            setLocalCart(items);
          }
        } catch {
          // A partly edited bundle cannot be paid for. Keep it in the seat
          // editor until every included event has the required selection.
        }
      }
      items = await fetchCart();

      setCartItems(items);

      // Fetch event info for all unique events in the cart
      const uniqueEventIds = [...new Set(items.map((i) => i.eventId))];
      const details = {};
      await Promise.all(
        uniqueEventIds.map(async (id) => {
          try {
            const res = await apiClient.get(`/events/public/${id}`);
            details[id] = res.data.event;
          } catch (e) {
            console.error("Failed to load details for event:", id, e);
          }
        })
      );
      setEventDetails(details);
      const firstEvent = details[items.find((item) => item.eventId)?.eventId];
      setCheckoutOrgSlug(firstEvent?.organizationId?.slug || "");

      const bundles = {};
      await Promise.all(
        items.filter((item) => item.itemType === "bundle" && item.bundleId).map(async (item) => {
          try {
            const bundleOrgSlug = firstEvent?.organizationId?.slug;
            if (!bundleOrgSlug) return;
            const res = await apiClient.get(`/o/${bundleOrgSlug}/bundles/${item.bundleId}`);
            bundles[item.bundleId] = res.data.bundle;
          } catch {
            // Cart snapshot remains usable even if a bundle's display data cannot load.
          }
        })
      );
      setBundleDetails(bundles);

      // Load wallet if user is logged in
      if (user) {
        const walletRes = await apiClient.get("/wallet").catch(() => ({ data: { wallet: { balance: 0 } } }));
        setWalletBalance(walletRes.data.wallet?.balance || 0);
      }

      // Load backend cart expiration
      const cartId = getCartId();
      const cartRes = await apiClient.get("/cart-sync", { headers: { "X-Cart-Id": cartId } }).catch(() => null);
      if (cartRes?.data?.cart?.expiresAt) {
        setExpiresAt(new Date(cartRes.data.cart.expiresAt));
      } else {
        setExpiresAt(new Date(Date.now() + 48 * 60 * 60 * 1000));
      }
    } catch (err) {
      setError(err.response?.data?.message || "Could not load your shopping cart.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCartData();
  }, [user]);

  // Countdown timer effect
  useEffect(() => {
    if (!expiresAt) return;

    const updateTimer = () => {
      const diff = expiresAt.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Expired");
        setCartItems([]);
        localStorage.removeItem("stagepass_cart");
        window.dispatchEvent(new Event("cart-updated"));
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const handleRemoveItem = async (item) => {
    try {
      if (item.itemType === "bundle" && item.bundleId) {
        const res = await apiClient.delete(`/o/${checkoutOrgSlug}/bundles/${item.bundleId}/cart`, {
          headers: { "X-Cart-Id": getCartId() },
        });
        setLocalCart(res.data.cart?.items || []);
      } else if (item.blockId && item.seatId) {
        await serverUnlockSeat({
          eventId: item.eventId,
          eventSessionId: item.eventSessionId,
          blockId: item.blockId,
          seatId: item.seatId,
        });
      } else {
        // Remove normal ticket type locally and sync
        const items = getLocalCart().filter(
          (i) => !(String(i.eventId) === String(item.eventId) && i.ticketTypeIndex === item.ticketTypeIndex)
        );
        setLocalCart(items);
        const token = localStorage.getItem("token");
        if (token) {
          const cartId = getCartId();
          await apiClient.post("/cart-sync/sync", { items }, { headers: { "X-Cart-Id": cartId } });
        }
      }
      // Reload cart state
      const updatedItems = await fetchCart();
      setCartItems(updatedItems);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to remove item from cart.");
    }
  };

  const handleEditItem = async (item) => {
    try {
      if (item.itemType === "bundle" && item.bundleId) {
        const res = await apiClient.post(`/o/${checkoutOrgSlug}/bundles/${item.bundleId}/cart/edit`, {}, {
          headers: { "X-Cart-Id": getCartId() },
        });
        setLocalCart(res.data.cart?.items || []);
        navigate(`/o/${checkoutOrgSlug}/bundles/${item.bundleId}/seats?qty=${item.bundleQuantity || 1}`);
        return;
      }
      const eventOrgSlug = eventDetails[item.eventId]?.organizationId?.slug || checkoutOrgSlug;
      navigate(`/o/${eventOrgSlug}/events/${item.eventId}/seats${item.eventSessionId ? `?sessionId=${item.eventSessionId}` : ""}`);
    } catch (err) {
      setError(err.response?.data?.message || "Could not open this selection for editing.");
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    try {
      const res = await apiClient.post("/cart/coupons/validate", {
        code: couponCode.trim(),
        items: cartItems.map((item) => ({ ...item, clientKey: getCartItemKey(item) })),
      });
      setCouponApplied(couponCode.trim());
      setCouponDiscount(res.data.totalDiscount || 0);
      setCouponDiscountsByItem(res.data.discountsByKey || {});
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid coupon code.");
    }
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    if (!user && (!buyerName.trim() || !buyerEmail.trim())) {
      setError("Please fill in your name and email to proceed.");
      return;
    }

    setCheckoutLoading(true);
    setError("");

    const afterDiscount = Math.max(0, cartTotal - couponDiscount);
    const calculatedWalletDeduction = useWallet ? Math.min(walletBalance, afterDiscount) : 0;

    try {
      const checkoutData = {
        buyerName: user ? user.name : buyerName.trim(),
        buyerEmail: user ? user.email : buyerEmail.trim().toLowerCase(),
        items: cartItems,
        useWallet,
        walletDeduction: calculatedWalletDeduction,
        couponCode: couponApplied || null,
        rewardsToApply,
        refCode: sessionStorage.getItem("referralCode") || null,
        cartId: getCartId(),
      };

      if (!checkoutOrgSlug) throw new Error("Cart organizer could not be resolved.");
      const res = await apiClient.post(`/o/${checkoutOrgSlug}/bookings/checkout`, checkoutData);

      // Clear LocalStorage cart on success
      localStorage.removeItem("stagepass_cart");
      window.dispatchEvent(new Event("cart-updated"));

      if (res.data.success && res.data.confirmationUrl) {
        window.location.href = res.data.confirmationUrl;
      } else if (res.data.stripeUrl) {
        window.location.href = res.data.stripeUrl;
      }
    } catch (err) {
      setError(err.response?.data?.message || "Checkout failed. Please try again.");
      setCheckoutLoading(false);
    }
  };

  const cartTotal = cartItems.reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1),
    0
  );

  const afterDiscount = Math.max(0, cartTotal - couponDiscount);
  const calculatedWalletDeduction = useWallet ? Math.min(walletBalance, afterDiscount) : 0;
  const finalTotal = Math.max(0, afterDiscount - calculatedWalletDeduction);

  if (loading) {
    return (
      <div style={{ padding: "80px 20px", textAlign: "center", color: "var(--muted)" }}>
        <div className="spinner" style={{ margin: "0 auto 20px" }} />
        <p style={{ fontSize: "16px", fontWeight: 600 }}>Loading your unified cart...</p>
      </div>
    );
  }

  return (
    <div className="cart-page" style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>
      {cartItems.length > 0 && (
        <header className="cart-page__heading">
          <div>
            <p>SECURE CHECKOUT</p>
            <h1>Your cart</h1>
          </div>
          <span>{cartItems.length} item{cartItems.length === 1 ? "" : "s"} held</span>
        </header>
      )}
      {/* Expiry Header */}
      {cartItems.length > 0 && (
        <div className="cart-hold-banner" style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(201, 154, 60, 0.1)",
          border: "1px solid rgba(201, 154, 60, 0.2)",
          padding: "12px 20px",
          borderRadius: "12px",
          marginBottom: "24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--gold)" }}>
            <Timer size={18} />
            <span style={{ fontSize: "14px", fontWeight: 600 }}>Cart Expiration Hold:</span>
          </div>
          <span style={{ fontSize: "16px", fontWeight: "bold", fontFamily: "monospace", color: "#fff" }}>
            {timeLeft}
          </span>
        </div>
      )}

      {error && (
        <div style={{
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.25)",
          color: "#ef4444",
          padding: "14px 20px",
          borderRadius: "12px",
          marginBottom: "24px",
          fontSize: "14px",
          fontWeight: 500,
        }}>
          ⚠️ {error}
        </div>
      )}

      {cartItems.length === 0 ? (
        <div className="cart-empty-state">
          <div className="cart-empty-state__icon"><ShoppingBag size={38} /></div>
          <p className="cart-empty-state__eyebrow">YOUR TICKET DESK</p>
          <h2>Your shopping cart is empty</h2>
          <p>Select an event, choose your tickets or seats, and they will be safely held here while you check out.</p>
          <Link to="/browse" className="btn btn-primary cart-empty-state__cta">
            Discover events <span aria-hidden="true">→</span>
          </Link>
        </div>
      ) : (
        <div className="cart-layout" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "32px", alignItems: "start" }}>

          {/* Left Column: Cart items grouped by Event */}
          <div className="cart-items-list" style={{ display: "grid", gap: "24px" }}>
            {cartItems.filter((item) => item.itemType === "bundle").map((item) => (
              <div key={`bundle:${item.bundleId}`} className="card cart-item-card cart-bundle-card" style={{ padding: "20px", background: "#0a0c16", border: "1px solid rgba(201,154,60,0.35)", borderRadius: "16px" }}>
                <div className="cart-item-card__top" style={{ display: "flex", justifyContent: "space-between", gap: "16px", alignItems: "center" }}>
                  <div className="cart-item-card__identity" style={{ display: "flex", gap: "14px", alignItems: "center" }}>
                    {(item.bundleBannerImageUrl || bundleDetails[item.bundleId]?.bannerImageUrl) && <img src={item.bundleBannerImageUrl || bundleDetails[item.bundleId]?.bannerImageUrl} alt="" style={{ width: 108, height: 70, objectFit: "cover", borderRadius: 10, border: "1px solid rgba(201,154,60,0.25)" }} />}
                    <div>
                    <p style={{ margin: "0 0 4px", fontSize: "11px", color: "var(--gold)", fontWeight: 700, letterSpacing: "0.08em" }}>EVENT BUNDLE</p>
                    <h3 style={{ margin: "0 0 6px", fontSize: "18px", color: "#fff" }}>{item.bundleName || "Bundle"}</h3>
                    <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>{item.bundleQuantity} seat{item.bundleQuantity !== 1 ? "s" : ""} in each included event · {item.bundleSelections?.length || 0} seats selected</p>
                    </div>
                  </div>
                  <div className="cart-item-card__actions" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                    <div style={{ textAlign: "right" }}>
                      <strong style={{ color: "var(--gold)" }}>{formatUSD(item.unitPrice)}</strong>
                      {couponDiscountsByItem[getCartItemKey(item)] > 0 && <small style={{ display: "block", color: "#4ade80", marginTop: 4 }}>−{formatUSD(couponDiscountsByItem[getCartItemKey(item)])} coupon</small>}
                    </div>
                    <button type="button" onClick={() => handleEditItem(item)} style={{ background: "none", border: "none", color: "var(--gold)", cursor: "pointer", padding: "6px" }} title="Edit bundle seats">
                      <Pencil size={16} />
                    </button>
                    <button type="button" onClick={() => handleRemoveItem(item)} style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: "6px" }} title="Remove bundle from cart">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {Object.entries(
              cartItems.filter((item) => item.itemType !== "bundle").reduce((groups, item) => {
                // Group by eventId + sessionId so different sessions are shown separately
                const groupKey = `${item.eventId}::${item.eventSessionId || ""}`;
                if (!groups[groupKey]) groups[groupKey] = [];
                groups[groupKey].push(item);
                return groups;
              }, {})
            ).map(([groupKey, items]) => {
              const [eventId, sessionId] = groupKey.split("::");
              const event = eventDetails[eventId];

              // Find the correct session date if this is a multi-session event
              const sessionDate = (() => {
                if (sessionId && event?.sessions?.length) {
                  const sess = event.sessions.find(s => String(s._id) === String(sessionId));
                  if (sess?.dateTime) return new Date(sess.dateTime);
                }
                return event?.dateTime ? new Date(event.dateTime) : null;
              })();

              return (
                <div key={groupKey} className="card cart-item-card" style={{ padding: "20px", background: "#0a0c16", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px" }}>
                  {/* Event details summary */}
                  <div className="cart-event-heading" style={{ display: "flex", gap: "16px", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "16px" }}>
                    {event?.bannerImageUrl && (
                      <img src={event.bannerImageUrl} alt={event.name} style={{ width: "90px", height: "60px", objectFit: "cover", borderRadius: "8px" }} />
                    )}
                    <div>
                      <h3 style={{ margin: "0 0 4px", fontSize: "18px", color: "#fff" }}>{event?.name || "Event Loading..."}</h3>
                      <p style={{ margin: 0, fontSize: "13px", color: "var(--muted)" }}>
                        {sessionDate && sessionDate.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>

                  {/* List of seats/tickets for this event group */}
                  <div style={{ display: "grid", gap: "12px" }}>
                    {items.map((item, idx) => (
                      <div key={idx} className="cart-line-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.03)", padding: "12px 16px", borderRadius: "10px" }}>
                        <div>
                          <p style={{ margin: "0 0 2px", color: "#fff", fontWeight: 600, fontSize: "14px" }}>
                            {item.seatName ? `Seat ${item.seatName} (${item.sectionName})` : item.ticketTypeName || "Ticket Selection"}
                          </p>
                          <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>
                            Quantity: {item.quantity} &middot; Price: {formatUSD(item.unitPrice)}
                          </p>
                        </div>
                        <div className="cart-line-item__actions" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                          <span style={{ fontWeight: 600, color: "#fff" }}>
                            {formatUSD(item.unitPrice * item.quantity)}
                          </span>
                          {couponDiscountsByItem[getCartItemKey(item)] > 0 && <span style={{ color: "#4ade80", fontSize: 12 }}>−{formatUSD(couponDiscountsByItem[getCartItemKey(item)])}</span>}
                          <button
                            type="button"
                            onClick={() => handleEditItem(item)}
                            style={{ background: "none", border: "none", color: "var(--gold)", cursor: "pointer", padding: "6px" }}
                            title="Edit seat selection"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item)}
                            style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", padding: "6px" }}
                            title="Remove item"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Utilities live beneath the tickets, keeping the payment decision focused. */}
          <div className="cart-checkout-tools" style={{ display: "grid", gap: "24px" }}>

            {/* Checkout Form */}
            {!user && (
              <div className="card" style={{ padding: "20px", background: "#0a0c16", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px" }}>
                <h3 style={{ margin: "0 0 16px", fontSize: "16px", color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldCheck size={18} style={{ color: "var(--gold)" }} />
                  Guest Details
                </h3>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div className="field">
                    <label style={{ fontSize: "12px", color: "var(--muted)" }}>Full Name</label>
                    <div style={{ position: "relative" }}>
                      <UserIcon size={14} style={{ position: "absolute", left: "12px", top: "12px", color: "var(--muted)" }} />
                      <input
                        type="text"
                        placeholder="John Doe"
                        value={buyerName}
                        onChange={(e) => setBuyerName(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px 10px 36px", background: "#14162b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
                        required
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label style={{ fontSize: "12px", color: "var(--muted)" }}>Email Address</label>
                    <div style={{ position: "relative" }}>
                      <Mail size={14} style={{ position: "absolute", left: "12px", top: "12px", color: "var(--muted)" }} />
                      <input
                        type="email"
                        placeholder="john@example.com"
                        value={buyerEmail}
                        onChange={(e) => setBuyerEmail(e.target.value)}
                        style={{ width: "100%", padding: "10px 12px 10px 36px", background: "#14162b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Wallet Payment Option */}
            {user && walletBalance > 0 && (
              <div className="card" style={{ padding: "20px", background: "#0a0c16", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px" }}>
                <h3 style={{ margin: "0 0 12px", fontSize: "16px", color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldCheck size={18} style={{ color: "var(--gold)" }} />
                  Wallet Balance
                </h3>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#14162b", padding: "12px 16px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div>
                    <span style={{ display: "block", fontSize: "12px", color: "var(--muted)" }}>Available Balance</span>
                    <strong style={{ fontSize: "18px", color: "#fff" }}>{formatUSD(walletBalance)}</strong>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={useWallet}
                      onChange={(e) => setUseWallet(e.target.checked)}
                      style={{ width: "20px", height: "20px", accentColor: "var(--gold)", cursor: "pointer" }}
                    />
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "#fff" }}>Apply Balance</span>
                  </label>
                </div>
              </div>
            )}

            {/* Coupons & Discounts */}
            <div className="card" style={{ padding: "20px", background: "#0a0c16", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "16px", color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                <Tag size={18} style={{ color: "var(--gold)" }} />
                Coupon Codes
              </h3>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="text"
                  placeholder="Enter code"
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  style={{ flex: 1, padding: "8px 12px", background: "#14162b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
                />
                <button
                  type="button"
                  onClick={handleApplyCoupon}
                  className="btn"
                  style={{ padding: "8px 16px", background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: 600 }}
                >
                  Apply
                </button>
              </div>
              {couponApplied && (
                <p style={{ margin: "8px 0 0", color: "#4ade80", fontSize: "12px", fontWeight: 600 }}>
                  ✓ Coupon "{couponApplied}" applied successfully!
                </p>
              )}
            </div>

          </div>

          {/* Focused payment column */}
          <div className="cart-billing-panel" style={{ display: "grid", gap: "24px" }}>
            {/* Billing Summary */}
            <div className="card" style={{ padding: "20px", background: "#0a0c16", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px" }}>
              <h3 style={{ margin: "0 0 16px", fontSize: "16px", color: "#fff" }}>Billing Summary</h3>

              <div style={{ display: "grid", gap: "12px", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "var(--muted)" }}>
                  <span>Cart Subtotal:</span>
                  <span style={{ color: "#fff" }}>{formatUSD(cartTotal)}</span>
                </div>
                {couponDiscount > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "#4ade80" }}>
                    <span>Coupon Discount:</span>
                    <span>-{formatUSD(couponDiscount)}</span>
                  </div>
                )}
                {calculatedWalletDeduction > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "var(--gold)" }}>
                    <span>Wallet Applied:</span>
                    <span>-{formatUSD(calculatedWalletDeduction)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: "bold", color: "#fff" }}>
                  <span>Total Amount:</span>
                  <span>{formatUSD(finalTotal)}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="btn btn-primary"
                style={{ width: "100%", padding: "14px", fontSize: "15px", fontWeight: "bold", cursor: "pointer" }}
              >
                {checkoutLoading ? "Processing Payment..." : finalTotal === 0 ? "Confirm Booking (Free) ✓" : "Proceed to Payment →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const formatUSD = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value || 0);

const getCartItemKey = (item) => item.itemType === "bundle"
  ? `bundle:${item.bundleId}`
  : `${item.eventId}:${item.eventSessionId || ""}:${item.blockId || item.ticketTypeIndex || "ticket"}:${item.seatId || ""}`;
