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

// Organizer writes stay protected.
router.use(authenticate, resolveTenant, loadMembership);

router.post("/", upload.single("banner"), eventController.create);
router.put("/:eventId", upload.single("banner"), eventController.update);
router.delete(
  "/:eventId",
  checkRole(["owner", "admin"]),
  eventController.remove,
);

module.exports = router;
