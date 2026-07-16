import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";

const CartPage = () => {
  const { orgSlug, eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [cart, setCart] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await apiClient.get(`/o/${orgSlug}/cart/${eventId}`);
        if (!cancelled) {
          setEvent(res.data.event);
          setCart(res.data.cart);
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

  return (
    <div style={{ maxWidth: 740, margin: "0 auto" }}>
      <p style={{ marginBottom: 16 }}>
        <Link to={`/o/${orgSlug}/events/${eventId}`}>&larr; Back to event</Link>
        <span style={{ marginLeft: 16 }}>
          <Link to={`/o/${orgSlug}/events/${eventId}`}>+ Add more tickets</Link>
        </span>
      </p>

      <div style={styles.topBar}>
        <div>
          <p style={styles.kicker}>Your Cart</p>
          <h1 style={{ color: "var(--paper)", margin: "4px 0 0" }}>{event.name}</h1>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="badge">{items.length} item{items.length !== 1 ? "s" : ""}</span>
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
                <div key={item.ticketTypeIndex} className="card" style={styles.itemCard}>
                  <div style={styles.itemInfo}>
                    <h4 style={{ margin: "0 0 4px", color: "var(--text)" }}>
                      {item.ticketTypeName}
                    </h4>
                    <p style={{ margin: 0, color: "var(--muted)", fontSize: 14 }}>
                      Rs. {Number(item.unitPrice || 0)} each
                    </p>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: 12 }}>
                      {remaining} remaining
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
                    <p style={styles.itemTotal}>Rs. {Number(item.unitPrice || 0) * Number(item.quantity || 0)}</p>
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

          <div className="card" style={{ marginTop: 16, ...styles.summaryCard }}>
            <div style={styles.summaryRow}>
              <span>Subtotal ({items.reduce((s, i) => s + Number(i.quantity || 0), 0)} tickets)</span>
              <span style={{ fontWeight: 700 }}>Rs. {cartTotal}</span>
            </div>
            <button
              style={styles.checkoutBtn}
              onClick={() =>
                navigate(`/o/${orgSlug}/checkout/${eventId}`)
              }
            >
              Proceed to Checkout
            </button>
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