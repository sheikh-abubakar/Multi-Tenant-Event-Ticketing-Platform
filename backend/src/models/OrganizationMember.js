const mongoose = require("mongoose");
const { getDefaultPermissions } = require("../utils/permissions");

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
 *
 * Permissions are now DYNAMIC — each member has their own permission
 * array. By default, the permissions are set based on the role, but
 * an Owner can customize them at any time.
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
    permissions: {
      type: [String],
      default: function () {
        return getDefaultPermissions(this.role);
      },
    },
    invitationToken: {
      type: String,
      default: null,
    },
    invitationSentAt: {
      type: Date,
      default: null,
    },
    passwordSet: {
      type: Boolean,
      default: function () {
        // Owners and admins set their password at invite time
        return this.role === "owner" || this.role === "admin";
      },
    },
  },
  { timestamps: true }
);

// A user can only have ONE membership row per organization.
// Also doubles as our most common lookup index: "find this user's
// role in this org" — which is exactly what the auth middleware
// pipeline will query on every tenant-scoped request.
organizationMemberSchema.index({ userId: 1, organizationId: 1 }, { unique: true });

// Separate index on organizationId alone: needed for "list every
// member of this org" (Week 3 — team management screen), which
// queries by organizationId without necessarily knowing a userId.
organizationMemberSchema.index({ organizationId: 1 });

module.exports = mongoose.model("OrganizationMember", organizationMemberSchema);