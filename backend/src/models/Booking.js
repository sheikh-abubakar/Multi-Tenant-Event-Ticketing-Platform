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
      type: String,
      enum: ["pending", "confirmed", "cancelled", "expired"],
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
  },
  { timestamps: true },
);

bookingSchema.index({ organizationId: 1, eventId: 1 });
bookingSchema.index({ buyerEmail: 1, createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
