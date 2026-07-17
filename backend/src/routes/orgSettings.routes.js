const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");
const upload = require("../middlewares/upload");
const orgSettingsController = require("../controllers/orgSettings.controller");

const router = express.Router({ mergeParams: true });

router.use(authenticate, resolveTenant, loadMembership);

// Viewing/editing settings requires settings:read / settings:update
router.get("/", checkPermission("settings:read"), orgSettingsController.getSettings);
router.put("/", checkPermission("settings:update"), upload.single("logo"), orgSettingsController.updateSettings);

// Deleting the org requires org:delete
router.delete("/", checkPermission("org:delete"), orgSettingsController.deleteOrganization);

module.exports = router;