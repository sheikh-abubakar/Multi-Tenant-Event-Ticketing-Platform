const express = require("express");
const resolveTenant = require("../middlewares/resolveTenant");
const authenticate = require("../middlewares/authenticate");
const tenantController = require("../controllers/tenant.controller");

// mergeParams: true is required so this router can see :orgSlug,
// which is defined on the PARENT router it gets mounted under
// (see app.js: app.use("/api/o/:orgSlug", tenantRoutes)).
const router = express.Router({ mergeParams: true });

// Public route — tenant resolution only, no auth.
// This is the shape every buyer-facing storefront route will take.
router.get("/info", resolveTenant, tenantController.getPublicInfo);

// Protected route — auth AND tenant resolution.
// This is the shape every organizer-facing route will take.
router.get("/whoami", authenticate, resolveTenant, tenantController.whoAmI);

module.exports = router;
