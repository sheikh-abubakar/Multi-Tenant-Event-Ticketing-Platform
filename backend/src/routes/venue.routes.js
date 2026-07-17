const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");
const venueController = require("../controllers/venue.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, resolveTenant, loadMembership);

// Permission-gated CRUD
router.post("/", checkPermission("venues:create"), venueController.create);
router.get("/", checkPermission("venues:read"), venueController.list);
router.get("/:venueId", checkPermission("venues:read"), venueController.getOne);
router.put("/:venueId", checkPermission("venues:update"), venueController.update);

// Delete requires venues:delete permission (default: owner/admin only)
router.delete("/:venueId", checkPermission("venues:delete"), venueController.remove);

module.exports = router;