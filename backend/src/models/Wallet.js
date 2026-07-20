const mongoose = require("mongoose");

/**
 * Wallet — tracks user's store credit balance
 * 
 * Every user gets one wallet (auto-created on first access).
 * Wallet can be credited via refunds and debited via ticket purchases.
 */
const walletSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    balance: {
      type: Number,
      default: 0,
      min: 0,
    },
    currency: {
      type: String,
      default: "PKR",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", walletSchema);