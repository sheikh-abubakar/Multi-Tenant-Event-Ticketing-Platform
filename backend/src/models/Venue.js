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
    timezone: {
      type: String,
      required: true,
      enum: [
        "UTC",
        "Asia/Karachi",        // Pakistan (PKT, UTC+5)
        "Asia/Dubai",          // UAE (GST, UTC+4)
        "Asia/Kolkata",        // India (IST, UTC+5:30)
        "Asia/Riyadh",         // Saudi Arabia (AST, UTC+3)
        "Asia/Dhaka",          // Bangladesh (BST, UTC+6)
        "Asia/Kabul",          // Afghanistan (AFT, UTC+4:30)
        "Asia/Tehran",         // Iran (IRST, UTC+3:30)
        "Asia/Baghdad",        // Iraq (AST, UTC+3)
        "Asia/Singapore",      // Singapore (SGT, UTC+8)
        "Asia/Shanghai",       // China (CST, UTC+8)
        "Asia/Tokyo",          // Japan (JST, UTC+9)
        "Asia/Seoul",          // Korea (KST, UTC+9)
        "America/New_York",    // US East (EST/EDT)
        "America/Chicago",     // US Central (CST/CDT)
        "America/Denver",      // US Mountain (MST/MDT)
        "America/Los_Angeles", // US West (PST/PDT)
        "America/Toronto",     // Canada East
        "America/Vancouver",   // Canada West
        "America/Sao_Paulo",   // Brazil (BRT)
        "America/Mexico_City", // Mexico
        "Europe/London",       // UK (GMT/BST)
        "Europe/Berlin",       // Germany/France (CET/CEST)
        "Europe/Moscow",       // Russia (MSK)
        "Europe/Istanbul",     // Turkey (TRT)
        "Australia/Sydney",    // Australia East (AEST/AEDT)
        "Australia/Perth",     // Australia West (AWST)
        "Pacific/Auckland",    // New Zealand (NZST/NZDT)
        "Africa/Cairo",        // Egypt (EET)
        "Africa/Lagos",        // Nigeria (WAT)
        "Africa/Johannesburg", // South Africa (SAST)
      ],
      default: "Asia/Karachi",
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