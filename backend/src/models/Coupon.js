const mongoose = require("mongoose");

/**
 * Coupon Schema
 * Tracks discount codes scoped to a tenant (Organization).
 */
const couponSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },
    discountValue: {
      type: Number,
      required: true,
      min: 0,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null, // null means organization-wide (valid for any event)
      index: true,
    },
    expiresAt: {
      type: Date,
      default: null, // null means no expiration
    },
    maxUses: {
      type: Number,
      default: null, // null means unlimited uses
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Compound index: coupon codes must be unique within an organization
couponSchema.index({ organizationId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Coupon", couponSchema);
