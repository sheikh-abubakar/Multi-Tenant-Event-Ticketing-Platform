const mongoose = require("mongoose");

/**
 * Venue = a tenant-owned resource. Every Venue belongs to exactly
 * one Organization, tracked via organizationId — this is the field
 * that makes multi-tenancy actually work at the data level.
 */
const venueSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    capacity: {
      type: Number,
      min: 0,
    },
  },
  { timestamps: true }
);

// Every venue query in the app will filter by organizationId first —
// this index makes those queries fast as data grows.
venueSchema.index({ organizationId: 1 });

module.exports = mongoose.model("Venue", venueSchema);
