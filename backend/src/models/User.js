const mongoose = require("mongoose");

/**
 * User = global identity.
 *
 * IMPORTANT: This model has NO organizationId field.
 * A user is not "owned" by any single organization — the same user
 * (same email, same login) can be a member of multiple organizations
 * with different roles in each. That relationship lives in
 * OrganizationMember, not here.
 */
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: false,
      default: null,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    requiresPasswordSetup: {
      type: Boolean,
      default: false,
    },
    // Global platform access is deliberately separate from tenant roles.
    // This field is set only by scripts/createSuperAdmin.js, never by signup.
    platformRole: {
      type: String,
      enum: ["user", "super_admin"],
      default: "user",
      index: true,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
    otpCode: {
      type: String,
      default: null,
    },
    otpExpiresAt: {
      type: Date,
      default: null,
    },
    city: {
      type: String,
      default: null,
      trim: true,
    },
    address: {
      type: String,
      default: null,
      trim: true,
    },
    latitude: {
      type: Number,
      default: null,
    },
    longitude: {
      type: Number,
      default: null,
    },
    categoryInterests: [{
      categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category"
      },
      score: {
        type: Number,
        default: 0
      },
      lastInteracted: {
        type: Date,
        default: Date.now
      }
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
