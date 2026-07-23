import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";

const CartPage = () => {
  const { orgSlug, eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [cart, setCart] = useState(null);
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [useWallet, setUseWallet] = useState(false);

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
          setEvent(cartRes.data.event);
          setCart(cartRes.data.cart);
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

  const handleQuantityChange = async (ticketTypeIndex, newQuantity) => {
    try {
      const res = await apiClient.put(`/o/${orgSlug}/cart/${eventId}/items`, {
        ticketTypeIndex,
        quantity: Math.max(0, newQuantity),
      });
      setCart(res.data.cart);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update item.");
    }
  };

  const handleRemoveItem = async (ticketTypeIndex) => {
    try {
      const res = await apiClient.delete(
        `/o/${orgSlug}/cart/${eventId}/items/${ticketTypeIndex}`,
      );
      setCart(res.data.cart);
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove item.");
    }
  };

  const cartTotal = (cart?.items || []).reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0),
    0,
  );

  const walletDeduction = useWallet ? Math.min(walletBalance, cartTotal) : 0;
  const remainingAfterWallet = cartTotal - walletDeduction;

  if (loading) return <p style={{ color: "var(--muted)" }}>Loading cart…</p>;

  if (error) {
    return (
      <div className="card" style={{ maxWidth: 640 }}>
        <p style={{ marginTop: 0 }}>
          <Link to={`/o/${orgSlug}/events/${eventId}`}>&larr; Back to event</Link>
        </p>
        <h3 style={{ marginTop: 0, color: "var(--danger)" }}>Cart error</h3>
        <p>{error}</p>
      </div>
    );
  }

  if (!event) return null;

  const items = cart?.items || [];
  const eventDate = new Date(event.dateTime);

  return (
    <div className="cart-page" style={{ maxWidth: 900, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link to={`/o/${orgSlug}/events/${eventId}`}>&larr; Back to event</Link>
        <span style={{ marginLeft: 16 }}>
          <Link to={`/o/${orgSlug}/events/${eventId}`}>+ Add more tickets</Link>
        </span>
      </p>

      {/* Event Info Card */}
      <div className="card cart-event-card" style={{ marginBottom: 20, padding: 0, overflow: "hidden" }}>
        {event.bannerImageUrl && (
          <div
            style={{
              width: "100%",
              height: 200,
              backgroundImage: `url(${event.bannerImageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          />
        )}
        <div style={{ padding: "20px 24px" }}>
          <p style={styles.kicker}>Your Cart</p>
          <h1 style={{ color: "var(--paper)", margin: "4px 0 12px", fontSize: 28 }}>{event.name}</h1>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14, color: "var(--muted)" }}>
            <span>📅 {eventDate.toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}</span>
            <span>📍 {event.venueId?.name || "TBA"}{event.venueId?.city ? `, ${event.venueId.city}` : ""}</span>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Your cart is empty</h3>
          <p style={{ color: "var(--muted)" }}>
            <Link to={`/o/${orgSlug}/events/${eventId}`}>Browse ticket types</Link> to add tickets.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gap: 12 }}>
            {items.map((item) => {
              const ticketType = event.ticketTypes?.[item.ticketTypeIndex];
              const remaining = ticketType
                ? Math.max(0, Number(ticketType.quantityTotal) - Number(ticketType.quantityBooked || 0))
                : 0;

              return (
                <div key={item.ticketTypeIndex} className="card cart-item-card" style={styles.itemCard}>
                  <div style={styles.itemInfo}>
                    <h4 style={{ margin: "0 0 4px", color: "var(--text)", fontSize: 16 }}>
                      {item.ticketTypeName}
                    </h4>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
                      Rs. {Number(item.unitPrice || 0)} per ticket
                    </p>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>
                      {remaining > 0 ? `${remaining} tickets available` : "Sold out"}
                    </p>
                  </div>

                  <div style={styles.itemActions}>
                    <div style={styles.qtyControl}>
                      <button
                        style={styles.qtyBtn}
                        onClick={() => handleQuantityChange(item.ticketTypeIndex, Number(item.quantity) - 1)}
                        disabled={Number(item.quantity) <= 1}
                      >
                        −
                      </button>
                      <span style={styles.qtyValue}>{item.quantity}</span>
                      <button
                        style={styles.qtyBtn}
                        onClick={() => handleQuantityChange(item.ticketTypeIndex, Number(item.quantity) + 1)}
                        disabled={Number(item.quantity) >= remaining}
                      >
                        +
                      </button>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 90 }}>
                      <p style={styles.itemTotal}>Rs. {Number(item.unitPrice || 0) * Number(item.quantity || 0)}</p>
                      <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>
                        {item.quantity} x Rs. {Number(item.unitPrice || 0)}
                      </p>
                    </div>
                    <button
                      style={styles.removeBtn}
                      onClick={() => handleRemoveItem(item.ticketTypeIndex)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card cart-summary-card" style={{ marginTop: 16, ...styles.summaryCard }}>
            <div style={styles.summaryRow}>
              <div>
                <span style={{ fontSize: 16, color: "var(--text)" }}>
                  Subtotal ({items.reduce((s, i) => s + Number(i.quantity || 0), 0)} tickets)
                </span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 20, color: "var(--paper)" }}>Rs. {cartTotal}</span>
            </div>

            {/* Wallet Payment Option */}
            {walletBalance > 0 && (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: "rgba(201, 154, 60, 0.08)",
                borderRadius: 10,
                marginBottom: 12,
                border: "1px solid rgba(201, 154, 60, 0.25)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <input
                    type="checkbox"
                    id="useWallet"
                    checked={useWallet}
                    onChange={(e) => setUseWallet(e.target.checked)}
                    style={{ width: 18, height: 18, accentColor: "#c99a3c", cursor: "pointer" }}
                  />
                  <label htmlFor="useWallet" style={{ margin: 0, cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
                    <strong>Pay with Wallet</strong>
                    <br />
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Balance: Rs. {walletBalance}
                    </span>
                  </label>
                </div>
                {useWallet && (
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: 0, fontSize: 13, color: "#4ade80", fontWeight: 600 }}>
                      -Rs. {walletDeduction}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--muted)" }}>
                      Remaining: Rs. {remainingAfterWallet}
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              style={styles.checkoutBtn}
              onClick={() =>
                navigate(`/o/${orgSlug}/checkout/${eventId}`, {
                  state: { 
                    useWallet, 
                    walletDeduction,
                    cartTotal,
                    remainingAfterWallet 
                  },
                })
              }
            >
              {useWallet && walletDeduction > 0
                ? `Pay Rs. ${remainingAfterWallet} with Card`
                : "Proceed to Checkout"}
            </button>
            {useWallet && walletDeduction > 0 && (
              <p style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
                Rs. {walletDeduction} will be deducted from your wallet
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const styles = {
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    marginBottom: 20,
  },
  kicker: {
    margin: 0,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontSize: 12,
    color: "var(--muted)",
  },
  itemCard: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
  },
  itemInfo: {
    flex: 1,
  },
  itemActions: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  },
  qtyControl: {
    display: "flex",
    alignItems: "center",
    gap: 0,
    borderRadius: 8,
    overflow: "hidden",
    border: "1px solid #d8d0bd",
    background: "#fffdf8",
  },
  qtyBtn: {
    background: "#efe9da",
    border: "none",
    color: "#1e2030",
    padding: "6px 12px",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: 700,
  },
  qtyValue: {
    padding: "6px 12px",
    minWidth: 32,
    textAlign: "center",
    color: "#1e2030",
    fontSize: 15,
    fontWeight: 600,
  },
  itemTotal: {
    margin: 0,
    color: "#c99a3c",
    fontWeight: 700,
    minWidth: 80,
    textAlign: "right",
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#c0503e",
    cursor: "pointer",
    fontSize: 16,
    padding: 4,
  },
  summaryCard: {
    borderTop: "2px dashed rgba(20, 22, 43, 0.15)",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    fontSize: 18,
    color: "var(--text)",
  },
  checkoutBtn: {
    display: "block",
    width: "100%",
    padding: "14px 24px",
    background: "#c99a3c",
    color: "#1e2030",
    border: "none",
    borderRadius: 12,
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
};

export default CartPage;
