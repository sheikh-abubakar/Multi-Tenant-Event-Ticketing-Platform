const stripe = require("../config/stripe");
const bookingService = require("../services/booking.service");

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

module.exports = {
  create,
  createCheckout,
  confirm,
  getOne,
  getByEvent,
  handleWebhook,
};