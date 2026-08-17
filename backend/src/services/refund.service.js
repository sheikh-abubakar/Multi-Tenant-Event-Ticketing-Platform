const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Event = require("../models/Event");
const stripe = require("../config/stripe");
const walletService = require("./wallet.service");

const REFUND_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const STRIPE_DEDUCTION_PERCENT = 0.1; // 10%

// Seat-map bookings reserve individual inventory records. A successful refund
// must return exactly those seats, just as legacy ticket refunds return value
// to the buyer. Keep this transaction tenant-scoped to avoid cross-org writes.
const releaseRefundedSeats = async (booking) => {
  if (!booking.selectedSeats?.length) return;
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const event = await Event.findOne({ _id: booking.eventId, organizationId: booking.organizationId }).session(session);
    if (event?.selectedSeatMap) {
      for (const reference of booking.selectedSeats) {
        const seat = event.selectedSeatMap.blocks?.find((block) => block.id === reference.blockId)?.seats?.find((item) => item.id === reference.seatId);
        if (seat?.status === "sold") seat.status = "available";
      }
      event.markModified("selectedSeatMap");
      await event.save({ session });
    }
    await session.commitTransaction();
  } catch (error) { await session.abortTransaction(); throw error; } finally { session.endSession(); }
};

/**
 * Refund Service
 * 
 * Handles refund requests with two methods:
 * 1. Wallet Credit — 100% refund, credited to user's wallet
 * 2. Stripe Refund — 90% refund via Stripe, 10% goes to organization revenue
 */

/**
 * Check if a booking is eligible for refund
 */
const validateRefundEligibility = (booking, userEmail) => {
  // Must be the same email as the buyer
  if (booking.buyerEmail !== userEmail.toLowerCase()) {
    const error = new Error("This booking does not belong to you");
    error.statusCode = 403;
    throw error;
  }

  // Must be confirmed status
  if (booking.status !== "confirmed") {
    const error = new Error("Only confirmed bookings can be refunded");
    error.statusCode = 400;
    throw error;
  }

  // Must be within 3-day window
  const now = new Date();
  const bookingAge = now - booking.createdAt;
  if (bookingAge > REFUND_WINDOW_MS) {
    const error = new Error("Refund period has expired (3 days from purchase)");
    error.statusCode = 400;
    throw error;
  }

  // Cannot be already refunded
  if (booking.status === "refunded") {
    const error = new Error("This booking has already been refunded");
    error.statusCode = 400;
    throw error;
  }

  return true;
};

/**
 * Process refund — Wallet method (100% refund)
 */
const processWalletRefund = async (booking, userId) => {
  const totalAmount = booking.totalAmount;
  const deduction = 0;
  const organizationRevenue = 0;

  // Credit the user's wallet with full amount
  await walletService.credit(
    userId,
    totalAmount,
    `Refund for ${booking.confirmationCode} — ${booking.eventId?.name || "Event"}`,
    { type: "refund", bookingId: booking._id }
  );

  // Update booking
  booking.status = "refunded";
  booking.refundInfo = {
    method: "wallet",
    amount: totalAmount,
    deduction: 0,
    organizationRevenue: 0,
    processedAt: new Date(),
  };
  await booking.save();
  await releaseRefundedSeats(booking);

  return {
    method: "wallet",
    amountRefunded: totalAmount,
    deduction: 0,
    organizationRevenue: 0,
    netToBuyer: totalAmount,
  };
};

/**
 * Process refund — Stripe method (90% refund, 10% to org)
 */
const processStripeRefund = async (booking, userId) => {
  const totalAmount = booking.totalAmount;
  const deductionAmount = Math.round(totalAmount * STRIPE_DEDUCTION_PERCENT);
  const organizationRevenue = deductionAmount; // 10% goes to org
  const refundAmount = totalAmount - deductionAmount;

  try {
    // Retrieve Stripe session to get payment intent
    const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
    const paymentIntentId = session.payment_intent;

    if (!paymentIntentId) {
      throw new Error("No payment intent found for this booking");
    }

    // Process Stripe refund (in cents/paisa — multiply by 100)
    const stripeRefundAmount = Math.round(refundAmount * 100);
    await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: stripeRefundAmount,
    });

    // Update booking
    booking.status = "refunded";
    booking.refundInfo = {
      method: "stripe",
      amount: refundAmount,
      deduction: deductionAmount,
      organizationRevenue: organizationRevenue,
      processedAt: new Date(),
    };
    await booking.save();
    await releaseRefundedSeats(booking);

    return {
      method: "stripe",
      amountRefunded: refundAmount,
      deduction: deductionAmount,
      organizationRevenue: organizationRevenue,
      netToBuyer: refundAmount,
    };
  } catch (stripeError) {
    console.error("[Refund] Stripe refund failed:", stripeError.message);
    const error = new Error(`Stripe refund failed: ${stripeError.message}`);
    error.statusCode = 500;
    throw error;
  }
};

/**
 * Request refund for a booking
 * 
 * @param {string} bookingId - Booking ID to refund
 * @param {string} userEmail - Buyer's email (from JWT)
 * @param {string} userId - Buyer's user ID (for wallet)
 * @param {string} method - "wallet" or "stripe"
 * @returns {object} Refund result
 */
const requestRefund = async (bookingId, userEmail, userId, method) => {
  if (!method || !["wallet", "stripe"].includes(method)) {
    const error = new Error("Refund method must be 'wallet' or 'stripe'");
    error.statusCode = 400;
    throw error;
  }

  // Find booking by ID
  const booking = await Booking.findById(bookingId).populate("eventId", "name organizationId");

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  // Validate eligibility
  validateRefundEligibility(booking, userEmail);

  // Process based on method
  if (method === "wallet") {
    return processWalletRefund(booking, userId);
  } else {
    return processStripeRefund(booking, userId);
  }
};

/**
 * Get user's bookings by email
 */
const getMyBookings = async (userEmail) => {
  return Booking.find({ buyerEmail: userEmail.toLowerCase() })
    .populate({
      path: "eventId",
      select: "name dateTime venueId bannerImageUrl",
      populate: {
        path: "venueId",
        model: "Venue",
        select: "name city",
      },
    })
    // Needed so the frontend can link to /o/:orgSlug/... — the route
    // resolves tenants by slug, not by organizationId, so without this
    // the "View" button was building a link with the raw ObjectId and
    // tenant resolution failed with "No organization found for slug".
    .populate({
      path: "organizationId",
      select: "name slug",
    })
    .populate({
      path: "bundleId",
      select: "name bannerImageUrl",
    })
    .sort({ createdAt: -1 })
    .lean();
};

module.exports = {
  requestRefund,
  getMyBookings,
  REFUND_WINDOW_MS,
  STRIPE_DEDUCTION_PERCENT,
};
