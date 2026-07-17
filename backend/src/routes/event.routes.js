const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");
const upload = require("../middlewares/upload");
const eventController = require("../controllers/event.controller");

const router = express.Router({ mergeParams: true });

// Public storefront reads: no login required
router.get("/", resolveTenant, eventController.list);
router.get("/:eventId", resolveTenant, eventController.getOne);

// Organizer writes — permission-gated
router.post("/", authenticate, resolveTenant, loadMembership, checkPermission("events:create"), upload.single("banner"), eventController.create);
router.put("/:eventId", authenticate, resolveTenant, loadMembership, checkPermission("events:update"), upload.single("banner"), eventController.update);
router.delete("/:eventId", authenticate, resolveTenant, loadMembership, checkPermission("events:delete"), eventController.remove);

module.exports = router;