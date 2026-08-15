const Booking = require("../models/Booking");
const Event = require("../models/Event");
const Venue = require("../models/Venue");
const moment = require("moment-timezone");

const escapeIcsText = (value) => String(value || "")
  .replace(/\\/g, "\\\\")
  .replace(/;/g, "\\;")
  .replace(/,/g, "\\,")
  .replace(/\r?\n/g, "\\n");

const formatDateUTC = (date, timezone) => moment
  .tz(date, timezone || "Asia/Karachi")
  .utc()
  .format("YYYYMMDDTHHmmss") + "Z";

const calendarHeaders = (res, filename) => {
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
};

const buildCalendarEvent = (booking, event, orgSlug) => {
  const venue = event.venueId || {};
  const timezone = event.timezone || venue.timezone || "Asia/Karachi";
  const startDate = booking.eventDateTime || event.dateTime;
  const eventName = booking.eventName || event.name || "StagePass Event";
  const location = [venue.name, venue.address, venue.city].filter(Boolean).join(", ");
  const tickets = (booking.items || []).map((item) =>
    `- ${item.ticketTypeName} x${item.quantity} ($${Number(item.lineTotal || 0).toFixed(2)})`,
  );
  const description = [
    `Confirmation Code: ${booking.confirmationCode}`,
    `Buyer: ${booking.buyerName}`,
    `Total Paid: $${Number(booking.totalAmount || 0).toFixed(2)}`,
    "",
    "Tickets:",
    ...tickets,
    "",
    `View your booking: ${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${orgSlug}/bookings/${booking._id}/confirmation`,
  ].join("\n");

  return [
    "BEGIN:VEVENT",
    `UID:${booking._id}@stagepass.com`,
    `DTSTAMP:${moment.utc().format("YYYYMMDDTHHmmss")}Z`,
    `DTSTART:${formatDateUTC(startDate, timezone)}`,
    `DTEND:${formatDateUTC(new Date(new Date(startDate).getTime() + 3 * 60 * 60 * 1000), timezone)}`,
    `SUMMARY:${escapeIcsText(eventName)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcsText(`Reminder: ${eventName} starts in 1 hour`)}`,
    "END:VALARM",
    "END:VEVENT",
  ];
};

/**
 * GET /api/o/:orgSlug/bookings/:bookingId/calendar.ics
 * Generates an iCalendar (.ics) file for the booking's event.
 * Buyers can download this file and add it to Google Calendar, Outlook, or Apple Calendar.
 */
const getCalendarEvent = async (req, res) => {
  try {
    const { bookingId, orgSlug } = req.params;
    const organizationId = req.organizationId;

    // Fetch booking with event and venue
    const booking = await Booking.findOne({
      _id: bookingId,
      organizationId,
      status: "confirmed",
    }).populate("eventId", "name dateTime description").populate({
      path: "eventId",
      populate: {
        path: "venueId",
        model: "Venue",
        select: "name address city",
      },
    });

    if (!booking || !booking.eventId) {
      return res.status(404).json({ message: "Booking or event not found" });
    }

    const event = booking.eventId;
    const venue = event.venueId;

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//StagePass//Event Ticketing//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...buildCalendarEvent(booking, event, orgSlug),
      "END:VCALENDAR",
    ].join("\r\n");

    const filename = `${event.name.replace(/[^a-z0-9]/gi, "_")}_tickets.ics`;
    calendarHeaders(res, filename);
    res.send(icsContent);
  } catch (error) {
    console.error("[Calendar] Error generating .ics:", error);
    res.status(500).json({ message: "Could not generate calendar file" });
  }
};

/**
 * GET /api/o/:orgSlug/bookings/:bookingId/calendar-all.ics
 * Creates one .ics file containing every confirmed booking from the same
 * Stripe checkout. This keeps a mixed cart (events and bundles) together.
 */
const getCheckoutCalendar = async (req, res) => {
  try {
    const { bookingId, orgSlug } = req.params;
    const primaryBooking = await Booking.findOne({
      _id: bookingId,
      organizationId: req.organizationId,
      status: "confirmed",
    });

    if (!primaryBooking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const checkoutQuery = primaryBooking.stripeSessionId
      ? { stripeSessionId: primaryBooking.stripeSessionId, status: "confirmed" }
      : primaryBooking.bundleBookingId
        ? { bundleBookingId: primaryBooking.bundleBookingId, status: "confirmed" }
        : { _id: primaryBooking._id, status: "confirmed" };
    const bookings = await Booking.find(checkoutQuery).populate({
      path: "eventId",
      select: "name dateTime timezone venueId",
      populate: { path: "venueId", model: "Venue", select: "name address city timezone" },
    });
    const validBookings = bookings.filter((booking) => booking.eventId);
    if (!validBookings.length) {
      return res.status(404).json({ message: "No event details found for this checkout" });
    }

    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//StagePass//Event Ticketing//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      ...validBookings.flatMap((booking) => buildCalendarEvent(booking, booking.eventId, orgSlug)),
      "END:VCALENDAR",
    ].join("\r\n");
    calendarHeaders(res, "stagepass_checkout_events.ics");
    res.send(icsContent);
  } catch (error) {
    console.error("[Calendar] Error generating checkout .ics:", error);
    res.status(500).json({ message: "Could not generate calendar file" });
  }
};

module.exports = { getCalendarEvent, getCheckoutCalendar };
