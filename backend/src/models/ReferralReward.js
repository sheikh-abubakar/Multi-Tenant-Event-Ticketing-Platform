const mongoose = require("mongoose");

/**
 * ReferralReward — tracks earned 10% discount rewards for users
 */
const referralRewardSchema = new mongoose.Schema(
  {
    referrerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referredBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    referredEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    discountPercent: {
      type: Number,
      default: 10,
    },
    status: {
      type: String,
      enum: ["available", "used"],
      default: "available",
      index: true,
    },
    usedInBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
    },
  },
  { timestamps: true }
);

// Compound index to prevent duplicate rewards for same referred friend email per referrer
referralRewardSchema.index({ referrerUserId: 1, referredEmail: 1 }, { unique: true });

module.exports = mongoose.model("ReferralReward", referralRewardSchema);
