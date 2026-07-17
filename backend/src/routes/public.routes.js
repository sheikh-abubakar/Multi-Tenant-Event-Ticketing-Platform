const express = require("express");
const publicController = require("../controllers/public.controller");

const router = express.Router();

// Public endpoints — no authentication required
router.get("/events", publicController.getAllPublicEvents);
router.get("/organizations/public", publicController.getAllOrganizations);

module.exports = router;
