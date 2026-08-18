const refundService = require("../services/refund.service");
const walletService = require("../services/wallet.service");
const Booking = require("../models/Booking");
const { recordPlatformAudit } = require("../utils/platformAudit");
const { notifyOrganizationBookingUpdate } = require("../services/organizationUpdate.service");
const { notifyUser, notifyOrganization } = require("../services/notification.service");

/**
 * GET /api/bookings/mine
 * Returns all bookings for the logged-in user (matched by email)
 */
const getMyBookings = async (req, res) => {
  try {
    const userEmail = req.user.email;
    const bookings = await refundService.getMyBookings(userEmail);
    return res.json({ bookings });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

/**
 * POST /api/bookings/refund
 * Request a refund for a booking
 * Body: { bookingId, method: "wallet" | "stripe" }
 */
const requestRefund = async (req, res) => {
  try {
    const { bookingId, method } = req.body;
    const userEmail = req.user.email;
    const userId = req.user._id;

    if (!bookingId) {
      return res.status(400).json({ message: "bookingId is required" });
    }

    const result = await refundService.requestRefund(bookingId, userEmail, userId, method);
    const booking = await Booking.findById(bookingId).select("organizationId totalAmount eventName userId").lean();
    if (booking) await recordPlatformAudit({ actorUserId: userId, organizationId: booking.organizationId, action: "booking.refunded", targetType: "booking", targetId: bookingId, metadata: { method, totalAmount: booking.totalAmount } });
    if (booking) notifyOrganizationBookingUpdate(booking.organizationId, { type: "booking-refunded", bookingId });
    if (booking) {
      const refundAmount = Number(result.amountRefunded ?? result.amount ?? booking.totalAmount);
      await notifyUser(userId, {
        type: "refund.processed",
        title: "Refund processed",
        message: `$${refundAmount.toFixed(2)} has been sent to your ${result.method === "wallet" ? "wallet" : "original payment method"}.`,
        link: "/my/wallet",
        metadata: { bookingId },
        dedupeKey: `refund-processed:buyer:${bookingId}`,
      });
      await notifyOrganization(booking.organizationId, {
        type: "refund.processed",
        title: "Booking refunded",
        message: `${req.user.name || req.user.email} received a ${result.method} refund for ${booking.eventName || "an event"}.`,
        link: "/my/notifications",
        metadata: { bookingId },
        dedupeKey: `refund-processed:organization:${bookingId}`,
      }, userId);
    }
    return res.json({ 
      message: result.method === "wallet" 
        ? "Refund processed! Amount credited to your wallet."
        : "Refund processed! Amount will be returned to your card (10% deduction applies).",
      result 
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

/**
 * GET /api/wallet
 * Returns wallet balance and transaction history
 */
const getWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const walletInfo = await walletService.getWalletInfo(userId);
    return res.json({ wallet: walletInfo });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { getMyBookings, requestRefund, getWallet };
