const mongoose = require("mongoose");

/**
 * OrganizationMember = the link between a User and an Organization,
 * carrying the role that user has IN THAT SPECIFIC organization.
 *
 * This is the core of the authorization model:
 * - Roles are NOT global. The same user can be "owner" in Org A
 *   and "staff" in Org B — two separate OrganizationMember documents.
 * - When we check "is this user allowed to do X in this org?", we
 *   look up the OrganizationMember for (userId, organizationId),
 *   never a role field on the User model itself.
 */
const organizationMemberSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    role: {
      type: String,
      enum: ["owner", "admin", "staff"],
      required: true,
    },
  },
  { timestamps: true }
);

// A user can only have ONE membership row per organization.
// Also doubles as our most common lookup index: "find this user's
// role in this org" — which is exactly what the auth middleware
// pipeline will query on every tenant-scoped request.
organizationMemberSchema.index({ userId: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model("OrganizationMember", organizationMemberSchema);
