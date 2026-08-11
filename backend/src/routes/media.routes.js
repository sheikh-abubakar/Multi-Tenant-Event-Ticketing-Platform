const express = require("express");
const router = express.Router({ mergeParams: true });
const mediaController = require("../controllers/media.controller");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");
const upload = require("../middlewares/upload");

// Require auth and organization membership for all routes
router.use(authenticate, resolveTenant, loadMembership);

router.get(
  "/",
  checkPermission("media:read"),
  mediaController.list
);

router.post(
  "/",
  checkPermission("media:create"),
  upload.single("file"),
  mediaController.upload
);

router.delete(
  "/:assetId",
  checkPermission("media:delete"),
  mediaController.remove
);

module.exports = router;
