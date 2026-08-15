const express = require("express");
const resolveTenant = require("../middlewares/resolveTenant");
const bookingController = require("../controllers/booking.controller");

const router = express.Router({ mergeParams: true });

// Stripe redirects to: /o/:orgSlug/bookings/:bookingId/confirmation?session_id=xxx
// But our frontend handles that page directly. So we just need the API endpoints:

const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select("-passwordHash");
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    next();
  }
};

// Unified cart checkout endpoint
router.post("/checkout", resolveTenant, optionalAuthenticate, bookingController.createUnifiedCheckout);

// Confirm a booking via session_id query param
router.get("/:bookingId/confirm", resolveTenant, bookingController.confirm);
router.post("/:bookingId/confirm", resolveTenant, bookingController.confirm);

// Get every booking paid in the same checkout, for an accurate buyer receipt total.
router.get("/:bookingId/checkout", resolveTenant, bookingController.getCheckoutBookings);

// Get a single booking by ID
router.get("/:bookingId", resolveTenant, bookingController.getOne);

// Get all bookings associated with a bundle Booking ID
router.get("/bundle/:bundleBookingId", resolveTenant, bookingController.getBundleBookings);

// Organizer-protected: verify a ticket directly
const authenticate = require("../middlewares/authenticate");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");
const checkRole = require("../middlewares/checkRole");

router.get(
  "/lookup/:identifier",
  authenticate,
  resolveTenant,
  loadMembership,
  checkRole(["owner", "admin"]),
  bookingController.lookup,
);

router.post(
  "/:bookingId/verify",
  authenticate,
  resolveTenant,
  loadMembership,
  checkPermission("events:update"),
  bookingController.verify
);

module.exports = router;
