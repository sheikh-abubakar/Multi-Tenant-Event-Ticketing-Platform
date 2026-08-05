const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");
const upload = require("../middlewares/upload");
const bundleController = require("../controllers/bundle.controller");

const router = express.Router({ mergeParams: true });

// Public endpoints
router.get("/", resolveTenant, bundleController.listPublic);
router.get("/:bundleId", resolveTenant, bundleController.getOne);
router.post("/:bundleId/checkout", resolveTenant, bundleController.checkout);
router.post("/:bundleId/verify-access", resolveTenant, bundleController.verifyAccess);

// Organizer management endpoints
router.get(
  "/:bundleId/manage",
  authenticate,
  resolveTenant,
  loadMembership,
  checkPermission("events:update"),
  bundleController.getOneManage
);

router.post(
  "/",
  authenticate,
  resolveTenant,
  loadMembership,
  checkPermission("events:create"),
  upload.single("banner"),
  bundleController.create
);

router.put(
  "/:bundleId",
  authenticate,
  resolveTenant,
  loadMembership,
  checkPermission("events:update"),
  upload.single("banner"),
  bundleController.update
);

router.delete(
  "/:bundleId",
  authenticate,
  resolveTenant,
  loadMembership,
  checkPermission("events:delete"),
  bundleController.remove
);

module.exports = router;
