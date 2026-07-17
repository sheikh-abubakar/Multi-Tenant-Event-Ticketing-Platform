const express = require("express");
const resolveTenant = require("../middlewares/resolveTenant");
const authenticate = require("../middlewares/authenticate");
const loadMembership = require("../middlewares/loadMembership");
// const checkRole = require("../middlewares/checkRole");
const tenantController = require("../controllers/tenant.controller");

// mergeParams: true is required so this router can see :orgSlug,
// which is defined on the PARENT router it gets mounted under
// (see app.js: app.use("/api/o/:orgSlug", tenantRoutes)).
const router = express.Router({ mergeParams: true });

// Public route — tenant resolution only, no auth.
// This is the shape every buyer-facing storefront route will take.
router.get("/info", resolveTenant, tenantController.getPublicInfo);

// Protected route — FULL pipeline: authenticate -> resolveTenant ->
// loadMembership. Any logged-in member (any role) can reach this.
router.get(
  "/whoami",
  authenticate,
  resolveTenant,
  loadMembership,
  tenantController.whoAmI
);

// Role-restricted route — same pipeline PLUS checkRole. Only owner
// and admin get through; a "staff" member is blocked with a 403.
// router.get(
//   "/settings",
//   authenticate,
//   resolveTenant,
//   loadMembership,
//   checkRole(["owner", "admin"]),
//   tenantController.settingsPreview
// );

module.exports = router;
