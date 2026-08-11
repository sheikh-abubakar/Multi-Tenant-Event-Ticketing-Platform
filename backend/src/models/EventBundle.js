const mongoose = require("mongoose");

const eventBundleSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    venueId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Venue",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    eventIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event",
        required: true,
      },
    ],
    pricePerSeat: {
      type: Number,
      required: true,
      min: 0,
    },
    bannerImageUrl: {
      type: String,
      default: null,
    },
    youtubeUrl: {
      type: String,
      default: null,
      trim: true,
    },
    accessCode: {
      type: String,
      default: null,
      trim: true,
    },
    privateCodeExpiry: {
      type: Date,
      default: null,
    },
    allowedSections: [
      {
        eventId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Event",
        },
        blockId: {
          type: String,
        },
        blockName: {
          type: String,
        },
      },
    ],
  },
  { timestamps: true }
);

// Index to efficiently list bundles by tenant
eventBundleSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("EventBundle", eventBundleSchema);
