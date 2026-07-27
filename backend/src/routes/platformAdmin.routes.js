const express = require("express");
const authenticate = require("../middlewares/authenticate");
const requirePlatformAdmin = require("../middlewares/requirePlatformAdmin");
const controller = require("../controllers/platformAdmin.controller");

const router = express.Router();
router.use(authenticate, requirePlatformAdmin);
router.get("/overview", controller.overview);
router.get("/organizations", controller.organizations);
router.get("/organizations/:organizationId", controller.organizationDetail);
router.patch("/organizations/:organizationId/status", controller.updateOrganizationStatus);
router.get("/activity", controller.activity);

module.exports = router;
