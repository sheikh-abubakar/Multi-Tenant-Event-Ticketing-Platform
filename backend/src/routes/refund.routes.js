const express = require("express");
const authenticate = require("../middlewares/authenticate");
const refundController = require("../controllers/refund.controller");

const router = express.Router();

// All routes require authentication — user must be logged in
router.use(authenticate);

// GET /api/bookings/mine — Get user's bookings (by email from JWT)
router.get("/bookings/mine", refundController.getMyBookings);

// POST /api/bookings/refund — Request refund on a booking
router.post("/bookings/refund", refundController.requestRefund);

// GET /api/wallet — Get wallet balance + transactions
router.get("/wallet", refundController.getWallet);

module.exports = router;