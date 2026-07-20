const mongoose = require("mongoose");

const bookingItemSchema = new mongoose.Schema(
  {
    ticketTypeName: {
      type: String,
      required: true,
      trim: true,
    },
    ticketTypeIndex: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
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
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "PKR",
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
  },
  { timestamps: true },
);

bookingSchema.index({ organizationId: 1, eventId: 1 });
bookingSchema.index({ buyerEmail: 1, createdAt: -1 });

// COMPOUND indexes for the booking scheduler's two periodic sweeps
// (services/bookingScheduler.js), which run every 5 seconds against
// this collection — worth indexing precisely since they run so often:
//   releaseExpiredBookings(): { status, paymentStatus, expiresAt <= now }
//   sendPendingReminders():   { status, paymentStatus, reminderSentAt: null, createdAt <= cutoff }
bookingSchema.index({ status: 1, paymentStatus: 1, expiresAt: 1 });
bookingSchema.index({ status: 1, paymentStatus: 1, reminderSentAt: 1, createdAt: 1 });

module.exports = mongoose.model("Booking", bookingSchema);