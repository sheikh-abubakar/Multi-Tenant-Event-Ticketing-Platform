const express = require("express");
const resolveTenant = require("../middlewares/resolveTenant");
const bookingController = require("../controllers/booking.controller");

const router = express.Router({ mergeParams: true });

// IMPORTANT: static routes must come BEFORE dynamic :bookingId
// to avoid "confirm" being matched as a bookingId.

// Public: confirm booking after successful payment (called from success page).
// Note: `eventId` comes from the parent router's path param (:eventId)
// but the confirm service does NOT actually use eventId — it looks up
// the booking by session_id from Stripe. So passing a placeholder is fine.
router.get("/confirm", resolveTenant, bookingController.confirm);
router.post("/confirm", resolveTenant, bookingController.confirm);

// Public: start checkout → creates pending booking + Stripe session
router.post("/checkout", resolveTenant, bookingController.createCheckout);

// Public: get a single booking by ID
router.get("/:bookingId", resolveTenant, bookingController.getOne);

// Organizer-protected: get all bookings for an event
const authenticate = require("../middlewares/authenticate");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");

router.get("/", authenticate, resolveTenant, loadMembership, bookingController.getByEvent);

// Ticket verification route
router.post(
  "/:bookingId/verify",
  authenticate,
  resolveTenant,
  loadMembership,
  checkPermission("events:update"),
  bookingController.verify
);

module.exports = router;