const { logger } = require("../config/logger");

// A single Stripe Checkout can create many Booking documents.  These fields
// make the entire lifecycle searchable without ever recording payment/card
// data or a buyer's full email address.
const maskEmail = (email) => {
  if (!email || typeof email !== "string") return undefined;
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "[invalid-email]";
  return `${local.slice(0, 2)}***@${domain}`;
};

const bookingContext = (booking) => {
  if (!booking) return {};
  return {
    bookingId: booking._id?.toString?.() || booking._id,
    confirmationCode: booking.confirmationCode,
    stripeSessionId: booking.stripeSessionId,
    bundleBookingId: booking.bundleBookingId?.toString?.() || booking.bundleBookingId,
    organizationId: booking.organizationId?.toString?.() || booking.organizationId,
    eventId: booking.eventId?.toString?.() || booking.eventId,
    eventName: booking.eventName,
    buyer: maskEmail(booking.buyerEmail),
    amount: booking.totalAmount,
    currency: booking.currency || "USD",
    cartId: booking.cartId?.toString?.() || booking.cartId,
  };
};

const paymentTrace = (stage, context = {}, level = "info") => {
  logger.log(level, `Payment trace: ${stage}`, {
    domain: "payment",
    stage,
    ...context,
  });
};

module.exports = { paymentTrace, bookingContext, maskEmail };
