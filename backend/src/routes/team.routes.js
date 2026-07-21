const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkRole = require("../middlewares/checkRole");
const checkPermission = require("../middlewares/checkPermission");
const teamController = require("../controllers/team.controller");

const router = express.Router({ mergeParams: true });

// ── Public route (no auth) ────────────────────────────────────────
// Accept invitation — called via magic link in email
router.post("/accept-invite", teamController.acceptInvitation);

// ── Protected routes — require auth + membership ──────────────────
router.use(authenticate, resolveTenant, loadMembership);

// GET — any member can view team list (requires team:read permission)
// But keep it simple — any member can see who's in the org
router.get("/", teamController.getMembers);

// POST — invite requires team:invite permission
router.post("/invite", checkPermission("team:invite"), teamController.inviteMember);

// PUT — change role requires team:role permission
router.put("/:memberId/role", checkPermission("team:role"), teamController.updateMemberRole);

// PUT — update permissions (owner only, via permissions:manage)
router.put("/:memberId/permissions", checkPermission("permissions:manage"), teamController.updateMemberPermissions);

// DELETE — remove requires team:remove permission
router.delete("/:memberId", checkPermission("team:remove"), teamController.removeMember);

// PUT — assign venues to staff member (requires team:role permission)
router.put("/:memberId/venues", checkPermission("team:role"), teamController.assignVenues);

module.exports = router;
