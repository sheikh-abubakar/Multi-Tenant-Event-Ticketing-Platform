const express = require("express");
const authenticate = require("../middlewares/authenticate");
const refundController = require("../controllers/refund.controller");

const router = express.Router();

// All routes require authentication — user must be logged in
router.get("/bookings/mine", authenticate, refundController.getMyBookings);
router.post("/bookings/refund", authenticate, refundController.requestRefund);
router.get("/wallet", authenticate, refundController.getWallet);

module.exports = router;