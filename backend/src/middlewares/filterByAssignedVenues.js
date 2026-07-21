/**
 * Middleware: filterByAssignedVenues
 *
 * If the current user is a "staff" member, this middleware loads their
 * assignedVenues and attaches them to req.assignedVenueIds so that
 * downstream service functions can filter queries accordingly.
 *
 * If the user is "owner" or "admin", no filter is applied — they see everything.
 *
 * This MUST run AFTER authenticate, resolveTenant, and loadMembership
 * (which provides req.membership with the role).
 */
const filterByAssignedVenues = async (req, res, next) => {
  try {
    // If no membership attached, skip (e.g. public routes)
    if (!req.membership) {
      req.assignedVenueIds = null;
      return next();
    }

    // Owner and admin see everything — no filter
    if (req.membership.role === "owner" || req.membership.role === "admin") {
      req.assignedVenueIds = null;
      return next();
    }

    // Staff member — load assigned venues
    const assigned = req.membership.assignedVenues || [];

    // If no venues assigned, return empty array so they see nothing
    if (!assigned.length) {
      req.assignedVenueIds = [];
    } else {
      req.assignedVenueIds = assigned.map((v) =>
        typeof v === "object" ? v._id?.toString() : v.toString(),
      );
    }

    next();
  } catch (error) {
    console.error("[filterByAssignedVenues] Error:", error.message);
    req.assignedVenueIds = [];
    next();
  }
};

module.exports = filterByAssignedVenues;