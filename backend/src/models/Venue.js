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

// COMPOUND index, not just organizationId alone. Every venue list
// query filters by organizationId AND sorts by createdAt (newest
// first) — see venue.service.js listVenues(). A compound index lets
// MongoDB satisfy both the filter and the sort from the same index,
// instead of filtering with the index then sorting the results
// separately in memory.
venueSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("Venue", venueSchema);