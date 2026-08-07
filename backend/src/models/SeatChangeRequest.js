const mongoose = require("mongoose");

const seatChangeRequestSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    oldSeat: {
      blockId: { type: String, required: true },
      seatId: { type: String, required: true },
      seatName: { type: String, required: true },
      sectionName: { type: String, default: null },
      unitPrice: { type: Number, required: true },
    },
    newSeat: {
      blockId: { type: String, required: true },
      seatId: { type: String, required: true },
      seatName: { type: String, required: true },
      sectionName: { type: String, default: null },
      unitPrice: { type: Number, required: true },
    },
    priceDifference: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "n/a"],
      default: "n/a",
    },
    stripeSessionId: {
      type: String,
      default: null,
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SeatChangeRequest", seatChangeRequestSchema);
