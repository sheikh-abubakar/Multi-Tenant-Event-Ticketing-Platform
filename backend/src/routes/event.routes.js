const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const filterByAssignedVenues = require("../middlewares/filterByAssignedVenues");
const checkPermission = require("../middlewares/checkPermission");
const upload = require("../middlewares/upload");
const eventController = require("../controllers/event.controller");

const router = express.Router({ mergeParams: true });

// Public storefront reads: no login required — ALL events visible
router.get("/", resolveTenant, eventController.listPublic);

// Organizer-only listing that respects venue assignments (MUST be before :eventId wildcard)
router.get("/manage", authenticate, resolveTenant, loadMembership, filterByAssignedVenues, checkPermission("events:read"), eventController.list);

// Individual event by ID (public)
router.get("/:eventId", resolveTenant, eventController.getOne);
router.post("/:eventId/verify-access", resolveTenant, eventController.verifyAccess);

// Organizer writes — permission-gated and venue-filtered for staff
router.post("/", authenticate, resolveTenant, loadMembership, checkPermission("events:create"), upload.single("banner"), eventController.create);
router.put("/:eventId", authenticate, resolveTenant, loadMembership, checkPermission("events:update"), upload.single("banner"), eventController.update);
router.delete("/:eventId", authenticate, resolveTenant, loadMembership, checkPermission("events:delete"), eventController.remove);

module.exports = router;
