const stripe = require("../config/stripe");
const bookingService = require("../services/booking.service");
const cartService = require("../services/cart.service");
const { recordPlatformAudit } = require("../utils/platformAudit");
const { invalidateOrgCache } = require("../services/analytics.service");

const create = async (req, res) => {
  try {
    const booking = await bookingService.createBooking(
      req.params.eventId,
      req.organizationId,
      req.body,
    );
    return res.status(201).json({ booking });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const createCheckout = async (req, res) => {
  try {
    const result = await bookingService.createCheckoutSession(
      req.params.eventId,
      req.organizationId,
      req.params.orgSlug,
      req.body,
    );
    // The booking service has atomically moved selected seats into the booking
    // hold. Remove the browser's local cart snapshot so it cannot keep
    // overriding the live map after payment confirmation or hold expiry.
    await cartService.clearCart(req, req.organizationId, req.params.eventId, req.body.EventSeatMapSessionID || req.body.sessionId);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const confirm = async (req, res) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ message: "session_id query parameter is required" });
    }

    const booking = await bookingService.confirmBooking(session_id);
    await recordPlatformAudit({
      organizationId: booking.organizationId,
      action: "booking.confirmed",
      targetType: "booking",
      targetId: booking._id,
      metadata: {
        totalAmount: booking.totalAmount,
        buyerEmail: booking.buyerEmail.replace(/(^.).*(@.*$)/, "$1***$2"),
      },
    });
    return res.json({ booking });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getOne = async (req, res) => {
  try {
    const booking = await bookingService.getBooking(
      req.params.bookingId,
      req.organizationId,
    );
    return res.json({ booking });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getCheckoutBookings = async (req, res) => {
  try {
    const bookings = await bookingService.getCheckoutBookings(
      req.params.bookingId,
      req.organizationId,
    );
    return res.json({ bookings });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const lookup = async (req, res) => {
  try {
    const booking = await bookingService.lookupBooking(req.params.identifier, req.organizationId);
    return res.json({ booking });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getByEvent = async (req, res) => {
  try {
    const bookings = await bookingService.getEventBookings(
      req.params.eventId,
      req.organizationId,
    );
    return res.json({ bookings });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const handleWebhook = async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );

    await bookingService.handleStripeWebhook(event);
    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error.message);
    return res.status(400).json({ message: `Webhook Error: ${error.message}` });
  }
};

const verify = async (req, res) => {
  try {
    const booking = await bookingService.verifyTicket(
      req.params.bookingId,
      req.organizationId,
    );
    await recordPlatformAudit({
      organizationId: booking.organizationId,
      action: "booking.verified",
      targetType: "booking",
      targetId: booking._id,
      metadata: { buyerEmail: booking.buyerEmail },
    });
    // Bust the analytics cache so the organizer sees fresh verified counts immediately
    invalidateOrgCache(booking.organizationId.toString());
    return res.json({ message: "Ticket verified successfully", booking });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getBundleBookings = async (req, res) => {
  try {
    const bookings = await bookingService.getBundleBookings(
      req.params.bundleBookingId,
      req.organizationId
    );
    return res.json({ bookings });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const createUnifiedCheckout = async (req, res) => {
  try {
    const result = await bookingService.createUnifiedCheckout(
      req.organizationId,
      req.params.orgSlug,
      { ...req.body, userId: req.user?.id || null }
    );
    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = {
  create,
  createCheckout,
  confirm,
  getOne,
  getCheckoutBookings,
  lookup,
  getByEvent,
  handleWebhook,
  verify,
  getBundleBookings,
  createUnifiedCheckout,
};
