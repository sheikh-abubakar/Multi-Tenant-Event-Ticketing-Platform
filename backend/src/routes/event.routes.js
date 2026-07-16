const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkRole = require("../middlewares/checkRole");
const upload = require("../middlewares/upload");
const eventController = require("../controllers/event.controller");

const router = express.Router({ mergeParams: true });

// Public storefront reads: no login required, but we still resolve the org
// from :orgSlug so every query stays tenant-scoped.
router.get("/", resolveTenant, eventController.list);
router.get("/:eventId", resolveTenant, eventController.getOne);

// Organizer writes stay protected — authenticate applied per-route, not via router.use
// to avoid accidentally catching sub-routes (like /events/:eventId/bookings/*).
router.post("/", authenticate, resolveTenant, loadMembership, upload.single("banner"), eventController.create);
router.put("/:eventId", authenticate, resolveTenant, loadMembership, upload.single("banner"), eventController.update);
router.delete(
  "/:eventId",
  authenticate,
  resolveTenant,
  loadMembership,
  checkRole(["owner", "admin"]),
  eventController.remove,
);

module.exports = router;