const OrganizationMember = require("../models/OrganizationMember");

/**
 * Step 3 of the pipeline:
 *   authenticate → resolve org → LOAD MEMBERSHIP → check role
 *
 * By the time this middleware runs, we already know:
 *   - req.user          (who is logged in — from `authenticate`)
 *   - req.organizationId (which tenant this request is for — from `resolveTenant`)
 *
 * This middleware answers the actual multi-tenancy question:
 * "Is this specific user actually a member of THIS specific org?"
 *
 * A valid, logged-in user with a valid org in the URL is NOT enough —
 * if they have no OrganizationMember row for this org, they get
 * blocked here. This is exactly what stops org A's user from ever
 * touching org B's data, even if they know org B's slug.
 */
const loadMembership = async (req, res, next) => {
  try {
    const membership = await OrganizationMember.findOne({
      userId: req.user._id,
      organizationId: req.organizationId,
    });

    if (!membership) {
      return res.status(403).json({
        message: "You are not a member of this organization",
      });
    }

    req.membership = membership;
    next();
  } catch (error) {
    return res.status(500).json({ message: "Failed to load membership" });
  }
};

module.exports = loadMembership;
