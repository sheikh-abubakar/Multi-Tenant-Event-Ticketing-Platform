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

    // No explicit venue assignment means the staff member is not scoped to a
    // subset of venues. Their normal permissions (for example events:read)
    // should still allow them to work with the organization's existing events.
    // A non-empty assignment remains an intentional restriction.
    if (!assigned.length) {
      req.assignedVenueIds = null;
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
