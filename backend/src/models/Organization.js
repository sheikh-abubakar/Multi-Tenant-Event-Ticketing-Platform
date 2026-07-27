const mongoose = require("mongoose");

/**
 * Organization = the tenant.
 *
 * "slug" is what appears in the URL: /o/:orgSlug/...
 * It must be unique across the whole platform, url-safe, and lowercase.
 * This is how the tenant-resolution middleware will figure out
 * "which organization is this request for?" later.
 */
const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9-]+$/, // only lowercase letters, numbers, hyphens
    },
    logoUrl: {
      type: String,
      default: null,
    },
    // ─── Soft delete (team lead decision, Week 1) ────────────────────
    // Organizations are never actually removed from MongoDB. Deleting
    // just sets these two fields; resolveTenant (middleware) then
    // treats any org with isDeleted: true as if it doesn't exist for
    // every route in the app, while the document — and everything
    // linked to it (events, bookings, etc.) — stays in the database.
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    isSuspended: {
      type: Boolean,
      default: false,
      index: true,
    },
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspensionReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Organization", organizationSchema);
