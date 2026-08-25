const mongoose = require("mongoose");

const staffPassSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetType: {
      type: String,
      enum: ["event", "bundle"],
      required: true,
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
    },
    bundleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventBundle",
      default: null,
    },
    eventSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    passType: {
      type: String,
      enum: ["VIP Pass", "General Pass", "Backstage Pass", "Organizer Pass"],
      required: true,
    },
    status: {
      type: String,
      enum: ["draft", "active", "revoked", "verified"],
      default: "draft",
    },
    confirmationCode: {
      type: String,
      required: true,
      unique: true,
    },
    qrCodeUrl: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("StaffPass", staffPassSchema);
