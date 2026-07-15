const express = require("express");
const resolveTenant = require("../middlewares/resolveTenant");
const bookingController = require("../controllers/booking.controller");

const router = express.Router({ mergeParams: true });

// Stripe redirects to: /o/:orgSlug/bookings/:bookingId/confirmation?session_id=xxx
// But our frontend handles that page directly. So we just need the API endpoints:

// Confirm a booking via session_id query param
router.get("/:bookingId/confirm", resolveTenant, bookingController.confirm);
router.post("/:bookingId/confirm", resolveTenant, bookingController.confirm);

// Get a single booking by ID
router.get("/:bookingId", resolveTenant, bookingController.getOne);

module.exports = router;