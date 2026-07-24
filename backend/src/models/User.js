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
      required: true,
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
