const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    eventSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    blockId: {
      type: String,
      default: null,
    },
    seatId: {
      type: String,
      default: null,
    },
    seatName: {
      type: String,
      default: null,
    },
    sectionName: {
      type: String,
      default: null,
    },
    category: {
      type: String,
      default: null,
    },
    itemType: {
      type: String,
      enum: ["event", "bundle"],
      default: "event",
    },
    bundleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventBundle",
      default: null,
    },
    bundleName: { type: String, default: null },
    bundleBannerImageUrl: { type: String, default: null },
    bundleQuantity: { type: Number, default: null, min: 1 },
    bundleSelections: {
      type: [new mongoose.Schema({
        eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
        eventSessionId: { type: mongoose.Schema.Types.ObjectId, default: null },
        blockId: { type: String, required: true },
        seatId: { type: String, required: true },
        seatName: { type: String, default: null },
        sectionName: { type: String, default: null },
      }, { _id: false })],
      default: [],
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
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    cartId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// TTL index to automatically clean up expired carts from DB
cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Cart", cartSchema);
