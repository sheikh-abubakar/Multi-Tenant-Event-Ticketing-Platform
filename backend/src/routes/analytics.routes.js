const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");
const analyticsController = require("../controllers/analytics.controller");

const router = express.Router({ mergeParams: true });

// Only owner/admin can access analytics (via permissions:manage equivalent or settings:read)
// We use analytics:read — but for now, restrict to owner/admin
router.use(authenticate, resolveTenant, loadMembership);

// Analytics view requires settings:read or higher (owner/admin by default)
router.get("/", checkPermission("settings:read"), analyticsController.getAnalytics);
router.get("/events/:eventId", checkPermission("settings:read"), analyticsController.getEventAnalytics);

module.exports = router;