const express = require("express");
const authenticate = require("../middlewares/authenticate");
const topupController = require("../controllers/topup.controller");

const router = express.Router();

// Route to create top-up checkout session (requires auth)
router.post("/checkout", authenticate, topupController.createTopupSession);

module.exports = router;
