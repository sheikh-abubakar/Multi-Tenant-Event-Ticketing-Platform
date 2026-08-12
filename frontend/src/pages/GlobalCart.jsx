import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../api/client";
import "./GlobalCart.css";

const GlobalCart = () => {
  const navigate = useNavigate();
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyKey, setBusyKey] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await apiClient.get("/cart");
      setCarts(data.carts || []);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load your cart.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const total = useMemo(() => carts.reduce((sum, cart) => sum + Number(cart.total || 0), 0), [carts]);

  const removeItem = async (cart, item) => {
    const key = `${cart.eventId}:${item.blockId || item.ticketTypeIndex}:${item.seatId || "ticket"}`;
    setBusyKey(key);
    try {
      await apiClient.delete("/cart/items", {
        data: {
          eventId: cart.eventId,
          blockId: item.blockId,
          seatId: item.seatId,
          ticketTypeIndex: item.ticketTypeIndex,
        },
      });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove this item.");
    } finally {
      setBusyKey("");
    }
  };

  return (
    <div className="global-cart-page">
      <header className="global-cart-page__header">
        <Link to="/browse" className="global-cart-page__back">← Back to browse</Link>
        <p>PERSONAL TICKET CART</p>
        <h1>YOUR <em>SELECTIONS.</em></h1>
        <span>{carts.length} event{carts.length === 1 ? "" : "s"} · $ {total}</span>
      </header>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="global-cart-page__loading">Loading your saved selections…</div>}

      {!loading && !carts.length && (
        <section className="global-cart-page__empty">
          <h2>Your cart is waiting for a great night out.</h2>
          <p>Choose seats or tickets from any event and they will appear here.</p>
          <Link to="/browse" className="btn btn-primary">Browse events →</Link>
        </section>
      )}

      <div className="global-cart-page__groups">
        {carts.map((cart) => (
          <section key={cart.eventId} className="global-cart-group">
            <div className="global-cart-group__event">
              <div>
                <p>{cart.organizationName || "Organization"}</p>
                <h2>{cart.event.name}</h2>
                <span>{new Date(cart.event.dateTime).toLocaleString()} · {cart.event.venueId?.name || "Venue TBA"}</span>
              </div>
              <strong>$ {cart.total}</strong>
            </div>
            <div className="global-cart-group__items">
              {cart.items.map((item) => {
                const itemKey = `${cart.eventId}:${item.blockId || item.ticketTypeIndex}:${item.seatId || "ticket"}`;
                return (
                  <article key={itemKey}>
                    <div>
                      <h3>{item.ticketTypeName || `${item.sectionName || "Seat"} · ${item.seatName || "Selection"}`}</h3>
                      <p>{item.quantity} × $ {item.unitPrice}</p>
                    </div>
                    <div>
                      <strong>$ {Number(item.unitPrice || 0) * Number(item.quantity || 0)}</strong>
                      <button type="button" onClick={() => removeItem(cart, item)} disabled={busyKey === itemKey}>
                        {busyKey === itemKey ? "Removing…" : "Remove"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="global-cart-group__actions">
              <Link to={`/o/${cart.organizationSlug}/events/${cart.eventId}`}>Add more</Link>
              <button type="button" onClick={() => navigate(`/o/${cart.organizationSlug}/checkout/${cart.eventId}${cart.sessionId ? `?sessionId=${cart.sessionId}` : ""}`)}>
                Proceed to payment →
              </button>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default GlobalCart;
