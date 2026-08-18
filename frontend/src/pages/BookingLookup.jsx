import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CalendarClock, CheckCircle2, CreditCard, Mail, MapPin, Search, Ticket, UserRound } from "lucide-react";
import apiClient from "../api/client";
import "./BookingLookup.css";

const money = (value, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value || 0);
const dateTime = (value) => value ? new Date(value).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" }) : "Not available";

const BookingLookup = () => {
  const { orgSlug } = useParams();
  const [searchParams] = useSearchParams();
  const [identifier, setIdentifier] = useState("");
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const lookup = async (value) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    setLoading(true); setError(""); setBooking(null);
    try {
      const { data } = await apiClient.get(`/o/${orgSlug}/bookings/lookup/${encodeURIComponent(clean)}`);
      setBooking(data.booking);
    } catch (err) {
      setError(err.response?.data?.message || "Could not find this booking");
    } finally { setLoading(false); }
  };
  const submit = async (event) => { event.preventDefault(); lookup(identifier); };
  useEffect(() => {
    const bookingId = searchParams.get("bookingId");
    if (bookingId) { setIdentifier(bookingId); lookup(bookingId); }
  // Query link is the explicit trigger; lookup itself is stable for this route.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug, searchParams]);

  const event = booking?.eventId || {};
  const venue = event.venueId || {};
  const scheduledAt = booking?.eventDateTime || event.dateTime;

  return <div className="booking-lookup-page">
    <header className="booking-lookup-hero"><div><p>GUEST SERVICES / BOOKING DESK</p><h1>Booking Lookup</h1><span>Find a guest’s complete booking record using their confirmation code or booking ID.</span></div><Search size={38} /></header>
    <form className="booking-lookup-search" onSubmit={submit}><Search size={19} /><input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="e.g. BK-MSN1DBQY-7C077D" aria-label="Confirmation code or booking ID" autoFocus /><button disabled={loading || !identifier.trim()}>{loading ? "Searching…" : "Find booking"}</button></form>
    {error && <div className="booking-lookup-error">{error}</div>}
    {!booking && !error && !loading && <div className="booking-lookup-empty"><Ticket size={34} /><h2>Ready when your guest is</h2><p>Enter the code printed on their confirmation page or email.</p></div>}
    {booking && <div className="booking-record">
      <section className="booking-record__banner"><div><span>CONFIRMATION CODE</span><strong>{booking.confirmationCode}</strong><small>Booking ID: {booking._id}</small></div><b className={`status-${booking.status}`}>{booking.status}</b></section>
      <div className="booking-record__grid">
        <article><UserRound size={18} /><span>Buyer</span><strong>{booking.buyerName}</strong><small><Mail size={12} /> {booking.buyerEmail}</small></article>
        <article><CalendarClock size={18} /><span>Event schedule</span><strong>{event.name || booking.eventName || "Event"}</strong><small>{dateTime(scheduledAt)}</small></article>
        <article><MapPin size={18} /><span>Venue</span><strong>{venue.name || "Not available"}</strong><small>{[venue.address, venue.city].filter(Boolean).join(", ") || "No address available"}</small></article>
        <article><CreditCard size={18} /><span>Payment</span><strong>{money(booking.totalAmount, booking.currency)}</strong><small>{booking.paymentStatus} · {booking.refundInfo?.method ? `refunded via ${booking.refundInfo.method}` : "no refund"}</small></article>
      </div>
      <section className="booking-record__panel"><h2><Ticket size={17} /> Tickets &amp; seats</h2>
        <div className="booking-record__items">{booking.items?.map((item, index) => <div key={`${item.ticketTypeName}-${index}`}><span>{item.ticketTypeName}</span><small>Qty {item.quantity} × {money(item.unitPrice, booking.currency)}</small><strong>{money(item.lineTotal, booking.currency)}</strong></div>)}</div>
        {!!booking.selectedSeats?.length && <div className="booking-record__seats">{booking.selectedSeats.map((seat) => <span key={`${seat.blockId}-${seat.seatId}`}><CheckCircle2 size={13} /> {seat.sectionName || "Section"} · {seat.seatName} · {money(seat.unitPrice, booking.currency)}</span>)}</div>}
      </section>
      <footer className="booking-record__footer"><span>Created {dateTime(booking.createdAt)}</span><Link to={`/o/${orgSlug}/events/${event._id}`}>View event →</Link></footer>
    </div>}
  </div>;
};

export default BookingLookup;
