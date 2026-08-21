const express = require("express");
const authenticate = require("../middlewares/authenticate");
const withdrawalController = require("../controllers/withdrawal.controller");

const router = express.Router();

// All routes require authentication
router.post("/", authenticate, withdrawalController.requestWithdrawal);
router.get("/", authenticate, withdrawalController.getWithdrawals);

module.exports = router;
