const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkRole = require("../middlewares/checkRole");
const venueController = require("../controllers/venue.controller");

// mergeParams: true — needed to read :orgSlug from the parent mount
// (see app.js: app.use("/api/o/:orgSlug/venues", venueRoutes)).
const router = express.Router({ mergeParams: true });

// Applied to EVERY route below via router.use(): every venue action
// requires being logged in, resolves which org the URL is for, and
// confirms the user is actually a member of that org. This is the
// same 3-step pipeline from Week 1 — reused here without rewriting
// it, which is exactly the point of building it as middleware.
router.use(authenticate, resolveTenant, loadMembership);

// Any member (owner, admin, or staff) can create/view/edit venues —
// this is day-to-day operational work.
router.post("/", venueController.create);
router.get("/", venueController.list);
router.get("/:venueId", venueController.getOne);
router.put("/:venueId", venueController.update);

// Deleting a venue is more destructive — restricted to owner/admin.
// (This is a reasonable default; flag it to your team lead if you
// want a different rule here.)
router.delete("/:venueId", checkRole(["owner", "admin"]), venueController.remove);

module.exports = router;
