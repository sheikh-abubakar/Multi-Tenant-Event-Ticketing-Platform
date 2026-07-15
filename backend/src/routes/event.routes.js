const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkRole = require("../middlewares/checkRole");
const upload = require("../middlewares/upload");
const eventController = require("../controllers/event.controller");

const router = express.Router({ mergeParams: true });

// Same pipeline as venues — proven, reusable, no rewriting.
router.use(authenticate, resolveTenant, loadMembership);

// upload.single("banner") runs BEFORE the controller: it reads the
// multipart/form-data request, saves the file to disk, and attaches
// req.file. Field name must be "banner" on the client side.
router.post("/", upload.single("banner"), eventController.create);
router.get("/", eventController.list);
router.get("/:eventId", eventController.getOne);
router.put("/:eventId", upload.single("banner"), eventController.update);
router.delete("/:eventId", checkRole(["owner", "admin"]), eventController.remove);

module.exports = router;
