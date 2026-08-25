const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkRole = require("../middlewares/checkRole");
const staffPassController = require("../controllers/staffPass.controller");

const router = express.Router({ mergeParams: true });

// ── Buyer Hub routes (Personal Wallet) ──
// Requires authentication but is NOT organization-scoped since a user can have passes from multiple orgs.
// Mapped as: router.use("/api/my/staff-passes", ...) in app.js
router.get("/my/passes", authenticate, staffPassController.getUserPasses);

// ── Organization management routes (Owner Only) ──
// Requires owner access to manage/verify passes.
// Mapped as: router.use("/api/o/:orgSlug/staff-passes", ...) in app.js
router.get("/", authenticate, resolveTenant, loadMembership, checkRole(["owner"]), staffPassController.getOrgPasses);
router.post("/", authenticate, resolveTenant, loadMembership, checkRole(["owner"]), staffPassController.createPass);
router.put("/:passId", authenticate, resolveTenant, loadMembership, checkRole(["owner"]), staffPassController.updatePass);
router.delete("/:passId", authenticate, resolveTenant, loadMembership, checkRole(["owner"]), staffPassController.deletePass);
router.post("/:passId/send", authenticate, resolveTenant, loadMembership, checkRole(["owner"]), staffPassController.sendPass);
router.post("/:passId/verify", authenticate, resolveTenant, loadMembership, checkRole(["owner"]), staffPassController.verifyPass);

module.exports = router;
