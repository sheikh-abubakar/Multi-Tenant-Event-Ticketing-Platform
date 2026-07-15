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
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
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
  },
  { timestamps: true },
);

bookingSchema.index({ organizationId: 1, eventId: 1 });
bookingSchema.index({ buyerEmail: 1, createdAt: -1 });

module.exports = mongoose.model("Booking", bookingSchema);
