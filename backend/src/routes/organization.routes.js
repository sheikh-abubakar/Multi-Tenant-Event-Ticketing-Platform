const express = require("express");
const organizationController = require("../controllers/organization.controller");
const authenticate = require("../middlewares/authenticate");

const router = express.Router();

// Must be logged in (global identity) to create an org.
// This is NOT tenant-scoped yet — there's no tenant until this
// very request creates one.
router.post("/", authenticate, organizationController.create);

module.exports = router;
