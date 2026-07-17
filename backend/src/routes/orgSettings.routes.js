const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkRole = require("../middlewares/checkRole");
const upload = require("../middlewares/upload");
const orgSettingsController = require("../controllers/orgSettings.controller");

// mergeParams: true — needed to read :orgSlug from the parent mount
// (see app.js: app.use("/api/o/:orgSlug/settings", orgSettingsRoutes)).
const router = express.Router({ mergeParams: true });

// Same 3-step pipeline reused from every other tenant-scoped router —
// every settings action requires being a member of this org.
router.use(authenticate, resolveTenant, loadMembership);

// Viewing/editing settings: owner or admin only (staff cannot).
router.get("/", checkRole(["owner", "admin"]), orgSettingsController.getSettings);
router.put(
  "/",
  checkRole(["owner", "admin"]),
  upload.single("logo"),
  orgSettingsController.updateSettings,
);

// Deleting the organization itself is far more destructive than
// editing its name/logo — restricted to owner only.
router.delete("/", checkRole(["owner"]), orgSettingsController.deleteOrganization);

module.exports = router;