const express = require("express");
const organizationController = require("../controllers/organization.controller");
const authenticate = require("../middlewares/authenticate");

const router = express.Router();

// Must be logged in (global identity) to create an org.
// This is NOT tenant-scoped yet — there's no tenant until this
// very request creates one.
router.post("/", authenticate, organizationController.create);

// Lists every organization the logged-in user belongs to (any role).
// Powers the "pick your organization" screen on the frontend.
router.get("/mine", authenticate, organizationController.listMine);

module.exports = router;
