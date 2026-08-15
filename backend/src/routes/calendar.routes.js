const express = require("express");
const resolveTenant = require("../middlewares/resolveTenant");
const calendarController = require("../controllers/calendar.controller");

const router = express.Router({ mergeParams: true });

// Calendar .ics download — PUBLIC (no authentication required)
// Buyers can download their calendar file directly from the email link
// without needing to log in. The bookingId alone is not enough to access
// other booking data — this endpoint only returns the .ics file for the
// specific booking, and the booking must be confirmed.
router.use(resolveTenant);

router.get("/bookings/:bookingId/calendar.ics", calendarController.getCalendarEvent);
// One calendar file for every confirmed event paid in the same checkout.
router.get("/bookings/:bookingId/calendar-all.ics", calendarController.getCheckoutCalendar);

module.exports = router;
