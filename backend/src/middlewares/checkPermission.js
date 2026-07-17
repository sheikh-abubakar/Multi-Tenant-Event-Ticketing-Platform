const { hasPermission } = require("../utils/permissions");

/**
 * Middleware factory — checks whether the current user's membership
 * has a specific permission.
 *
 * Usage:
 *   router.delete("/venues/:id", authenticate, resolveTenant,
 *     loadMembership, checkPermission("venues:delete"), venueController.remove);
 *
 * This is a REPLACEMENT for checkRole. Instead of checking "is the
 * user's role in this list?", it checks "does the user's membership
 * have this specific permission?" — which allows owners to grant or
 * revoke individual permissions without changing a member's role.
 *
 * Must run AFTER loadMembership and checkPermissionGuard.
 */
const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.membership) {
      return res.status(500).json({
        message: "checkPermission used without loadMembership running first",
      });
    }

    const memberPermissions = req.membership.permissions || [];

    if (!hasPermission(requiredPermission, memberPermissions)) {
      return res.status(403).json({
        message: `Missing required permission: ${requiredPermission}`,
      });
    }

    next();
  };
};

module.exports = checkPermission;