/**
 * Step 4 of the pipeline:
 *   authenticate → resolve org → load membership → CHECK ROLE
 *
 * This is a middleware FACTORY, not a middleware itself — you call
 * it with the roles allowed for a route, and it returns the actual
 * middleware. Usage:
 *
 *   router.delete("/venues/:id", authenticate, resolveTenant,
 *     loadMembership, checkRole(["owner", "admin"]), venueController.remove);
 *
 * Must run AFTER loadMembership, because it reads req.membership.role
 * which loadMembership attaches.
 */
const checkRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.membership) {
      // Defensive check: this middleware was wired up without
      // loadMembership running first. That's a wiring bug, not
      // a user-facing auth failure.
      return res.status(500).json({
        message: "checkRole used without loadMembership running first",
      });
    }

    if (!allowedRoles.includes(req.membership.role)) {
      return res.status(403).json({
        message: `This action requires one of these roles: ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
};

module.exports = checkRole;
