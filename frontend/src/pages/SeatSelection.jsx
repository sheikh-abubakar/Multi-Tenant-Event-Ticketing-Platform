import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/client";
import { cachedGet } from "../api/requestCache";
import SeatMapCanvas from "../components/seatmap/SeatMapCanvas";
import "./SeatSelection.css";

const seatKey = (blockId, seatId) => `${blockId}:${seatId}`;

export default function SeatSelection() {
  const { orgSlug, eventId } = useParams();
  const navigate = useNavigate();
  const [map, setMap] = useState(null);
  const [cart, setCart] = useState({ items: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [mapResponse, cartResponse] = await Promise.all([
        cachedGet(`/o/${orgSlug}/events/${eventId}/seatmap`, 3_000),
        apiClient.get(`/o/${orgSlug}/cart/${eventId}`),
      ]);
      setMap(mapResponse.data.seatmap);
      setCart(cartResponse.data.cart);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load this seating plan.");
    }
  };

  useEffect(() => { load(); }, [orgSlug, eventId]);

  const selected = useMemo(
    () => new Set(cart.items.map((item) => seatKey(item.blockId, item.seatId))),
    [cart],
  );
  const total = cart.items.reduce(
    (sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1),
    0,
  );

  const toggle = async (block, seat) => {
    if (seat.status !== "available" || busy) return;
    setBusy(true);
    setError("");
    try {
      const exists = selected.has(seatKey(block.id, seat.id));
      const response = exists
        ? await apiClient.delete(`/o/${orgSlug}/cart/${eventId}/seats/${block.id}/${seat.id}`)
        : await apiClient.post(`/o/${orgSlug}/cart/${eventId}/items`, { blockId: block.id, seatId: seat.id });
      setCart(response.data.cart);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update your selection.");
    } finally {
      setBusy(false);
    }
  };

  const changeGaQuantity = async (block, increment) => {
    if (busy) return;
    const current = cart.items.filter((item) => item.blockId === block.id);
    const cartSeatIds = new Set(current.map((item) => item.seatId));
    const candidate = increment
      ? block.seats?.find((seat) => seat.status === "available" && !cartSeatIds.has(seat.id))
      : current.at(-1);
    if (!candidate) return;

    setBusy(true);
    setError("");
    try {
      const response = increment
        ? await apiClient.post(`/o/${orgSlug}/cart/${eventId}/items`, { blockId: block.id, seatId: candidate.id })
        : await apiClient.delete(`/o/${orgSlug}/cart/${eventId}/seats/${block.id}/${candidate.seatId}`);
      setCart(response.data.cart);
    } catch (err) {
      setError(err.response?.data?.message || "Could not update General Admission quantity.");
    } finally {
      setBusy(false);
    }
  };

  if (!map) return <p className="text-muted">Loading seating plan...</p>;

  const individualItems = cart.items.filter(
    (item) => !map.blocks.find((block) => block.id === item.blockId && block.type === "general-admission"),
  );

  return (
    <div className="seat-selection-page">
      <Link to={`/o/${orgSlug}/events/${eventId}`} className="seat-selection-page__back">&larr; Back to event</Link>
      <div className="seat-selection-page__layout">
        <section>
          <p className="seat-selection-page__eyebrow">SELECT YOUR PLACE</p>
          <h1>CHOOSE YOUR SEATS</h1>
          <div className="seat-selection-page__legend">
            <span className="available">Available</span><span className="selected">Selected</span>
            <span className="held">Temporarily held</span><span className="sold">Sold</span><span className="organizer">Organizer hold</span>
          </div>
          {error && <p className="seat-selection-page__error">{error}</p>}
          <SeatMapCanvas map={map} selectedIds={selected} onSeatClick={toggle} onGaClick={(block) => changeGaQuantity(block, true)} className="seat-selection-page__canvas" />
        </section>

        <aside className="seat-selection-summary">
          <p>YOUR SELECTION</p>
          {map.blocks.filter((block) => block.type === "general-admission").map((block) => {
            const quantity = cart.items.filter((item) => item.blockId === block.id).length;
            return (
              <div key={block.id} className="seat-selection-summary__ga">
                <span>{block.name} &middot; Rs. {block.price || 0}</span>
                <span className="seat-selection-summary__quantity">
                  <button type="button" onClick={() => changeGaQuantity(block, false)} disabled={!quantity || busy} aria-label={`Remove one ${block.name}`}>−</button>
                  <b>{quantity}</b>
                  <button type="button" onClick={() => changeGaQuantity(block, true)} disabled={busy} aria-label={`Add one ${block.name}`}>+</button>
                </span>
              </div>
            );
          })}
          <div className="seat-selection-summary__items">
            {individualItems.map((item) => (
              <div key={seatKey(item.blockId, item.seatId)}>
                <span>{item.sectionName} &middot; {item.seatName}</span><strong>Rs. {item.unitPrice}</strong>
              </div>
            ))}
            {!cart.items.length && <p className="seat-selection-summary__empty">Select seats directly on the map.</p>}
          </div>
          <div className="seat-selection-summary__total"><span>Total</span><strong>Rs. {total}</strong></div>
          <div className="seat-selection-actions">
            <button type="button" disabled={!cart.items.length || busy} onClick={() => navigate("/cart")} className="seat-selection-actions__cart">Add to cart</button>
            <button type="button" disabled={!cart.items.length || busy} onClick={() => navigate(`/o/${orgSlug}/checkout/${eventId}`)} className="seat-selection-actions__pay">Proceed to payment</button>
          </div>
          <small>Selections are saved in your cart until you are ready to check out.</small>
        </aside>
      </div>
    </div>
  );
}
