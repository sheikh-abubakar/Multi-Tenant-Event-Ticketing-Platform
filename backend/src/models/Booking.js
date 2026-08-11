const mongoose = require("mongoose");

const bookingItemSchema = new mongoose.Schema(
  {
    ticketTypeName: {
      type: String,
      trim: true,
    },
    ticketTypeIndex: {
      type: Number,
      min: 0,
    },
    quantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    unitPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    lineTotal: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

const selectedSeatSchema = new mongoose.Schema(
  {
    blockId: { type: String, required: true },
    seatId: { type: String, required: true },
    seatName: { type: String, required: true },
    sectionName: { type: String, default: null },
    category: { type: String, default: null },
    unitPrice: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const bookingSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Snapshot of the event's name/date AT THE TIME OF BOOKING. The
    // live `eventId` populate is still used where available (e.g. the
    // event's current banner image), but analytics/history views prefer
    // these snapshot fields so a booking's event name never breaks or
    // shows "Unknown" just because the event was later renamed or
    // deleted — the same pattern e-commerce receipts use for line-item
    // names.
    eventName: {
      type: String,
      default: null,
    },
    eventDateTime: {
      type: Date,
      default: null,
    },
    buyerName: {
      type: String,
      required: true,
      trim: true,
    },
    buyerEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    items: {
      type: [bookingItemSchema],
      default: [],
    },
    selectedSeats: {
      type: [selectedSeatSchema],
      default: [],
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
      trim: true,
    },
    status: {
      // "expired" = added for the auto-release feature: a pending
      // booking that timed out before payment was completed.
      // "refunded" = added for the refund/wallet system.
      type: String,
      enum: ["pending", "confirmed", "cancelled", "expired", "refunded"],
      default: "pending",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
      index: true,
    },
    stripeSessionId: {
      type: String,
      default: null,
      index: true,
    },
    confirmationCode: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
    },
    qrCodeUrl: {
      type: String,
      default: null,
    },
    // ─── Wallet-at-checkout fields ────────────────────────────────────
    // Added for the "pay partly with wallet" feature. These MUST be
    // declared here — Mongoose's default `strict: true` mode silently
    // drops any field set on a document that isn't in the schema, so
    // without these, booking.service.js's wallet writes (originalAmount,
    // walletDeduction, walletDeductionPending) were being set in memory
    // but never actually persisted, which meant the wallet debit in
    // confirmBooking() never ran after payment.
    //
    // `totalAmount` above always holds the amount actually charged to
    // the card (i.e. after any wallet deduction). `originalAmount` keeps
    // the pre-deduction cart total for reference/receipts/analytics.
    originalAmount: {
      type: Number,
      default: null,
    },
    // How much of this booking's total was covered by wallet balance.
    walletDeduction: {
      type: Number,
      default: 0,
    },
    // Non-zero between checkout-start and payment-confirmation: the
    // wallet amount still waiting to be actually debited once Stripe
    // confirms payment succeeded (we don't debit at checkout time,
    // since the buyer might still abandon/fail the Stripe payment).
    // Reset to 0 once confirmBooking() successfully debits the wallet.
    walletDeductionPending: {
      type: Number,
      default: 0,
    },
    // ─── Auto-release / reminder fields ──────────────────────────────
    // Set once, at booking creation: createdAt + HOLD_DURATION_MS.
    // The background scheduler compares "now" against this field to
    // decide when to release the held tickets — never relies on an
    // in-memory timer, so it survives server restarts.
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    // Set once the 30-second reminder email has actually been sent,
    // so the scheduler never sends it twice for the same booking.
    reminderSentAt: {
      type: Date,
      default: null,
    },
    // ─── Refund / Wallet fields ───────────────────────────────────────
    refundInfo: {
      method: {
        type: String,
        enum: ["wallet", "stripe"],
        default: null,
      },
      amount: {
        type: Number,
        default: null,
      },
      deduction: {
        type: Number,
        default: null,
      },
      // 10% goes to the organization whose event this booking was for
      organizationRevenue: {
        type: Number,
        default: null,
      },
      processedAt: {
        type: Date,
        default: null,
      },
    },
    // ─── Referral fields ──────────────────────────────────────────────
    referredByCode: {
      type: String,
      default: null,
      trim: true,
    },
    referrerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    referralRewardsUsedCount: {
      type: Number,
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    // ─── Coupon fields ──────────────────────────────────────────────
    couponCode: {
      type: String,
      default: null,
      trim: true,
    },
    couponDiscountAmount: {
      type: Number,
      default: 0,
    },
    // Ticket verification fields
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    // ─── Bundle Booking fields ───────────────────────────────────────
    bundleBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    isBundleBooking: {
      type: Boolean,
      default: false,
    },
    bundleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventBundle",
      default: null,
      index: true,
    },
    bundleName: {
      type: String,
      default: null,
    },
  },
  { timestamps: true },
);

bookingSchema.index({ organizationId: 1, eventId: 1 });
bookingSchema.index({ buyerEmail: 1, createdAt: -1 });

// ── Analytics compound indexes ────────────────────────────────────────────
// Every analytics aggregate starts with { organizationId, status } — without
// a compound index Mongo falls back to the single-field organisationId index
// and scans the entire org's booking collection to filter status in memory.
// These covering indexes let all 11 aggregation pipelines use index-only scans.
bookingSchema.index({ organizationId: 1, status: 1, createdAt: -1 });  // recent bookings sort
bookingSchema.index({ organizationId: 1, status: 1, totalAmount: 1 }); // revenue sums
bookingSchema.index({ organizationId: 1, eventId: 1, status: 1 });     // per-event analytics

// COMPOUND indexes for the booking scheduler's two periodic sweeps
// (services/bookingScheduler.js), which run every 5 seconds against
// this collection — worth indexing precisely since they run so often:
//   releaseExpiredBookings(): { status, paymentStatus, expiresAt <= now }
//   sendPendingReminders():   { status, paymentStatus, reminderSentAt: null, createdAt <= cutoff }
bookingSchema.index({ status: 1, paymentStatus: 1, expiresAt: 1 });
bookingSchema.index({ status: 1, paymentStatus: 1, reminderSentAt: 1, createdAt: 1 });

module.exports = mongoose.model("Booking", bookingSchema);
