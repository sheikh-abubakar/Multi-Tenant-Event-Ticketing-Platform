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
  },
  { timestamps: true }
);

module.exports = mongoose.model("Organization", organizationSchema);
