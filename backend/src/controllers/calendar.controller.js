const Booking = require("../models/Booking");
const Event = require("../models/Event");
const Venue = require("../models/Venue");
const moment = require("moment-timezone");

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

    // Get the event's timezone (from event.timezone, or venue's timezone, or default)
    const timezone = event.timezone || venue?.timezone || "Asia/Karachi";

    // Format dates for iCalendar in UTC using the event's timezone
    const formatDateUTC = (date, tz) => {
      return moment.tz(date, tz).utc().format("YYYYMMDDTHHmmss") + "Z";
    };

    const eventStart = formatDateUTC(event.dateTime, timezone);
    // Assume event duration is 3 hours (can be made configurable later)
    const eventEnd = formatDateUTC(new Date(new Date(event.dateTime).getTime() + 3 * 60 * 60 * 1000), timezone);

    // Build venue string for location
    const locationParts = [venue?.name, venue?.address, venue?.city].filter(Boolean);
    const location = locationParts.join(", ");

    // Build description
    const description = [
      `Confirmation Code: ${booking.confirmationCode}`,
      `Buyer: ${booking.buyerName}`,
      `Total Paid: Rs. ${booking.totalAmount}`,
      ``,
      `Tickets:`,
      ...booking.items.map(
        (item) => `  - ${item.ticketTypeName} x${item.quantity} (Rs. ${item.lineTotal})`,
      ),
      ``,
      `View your booking: ${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${orgSlug}/bookings/${bookingId}/confirmation`,
    ].join("\\n");

    // iCalendar format
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//StagePass//Event Ticketing//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${bookingId}@stagepass.com`,
      `DTSTART:${eventStart}`,
      `DTEND:${eventEnd}`,
      `SUMMARY:${event.name}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${description}`,
      `STATUS:CONFIRMED`,
      "BEGIN:VALARM",
      "TRIGGER:-PT1H",
      "ACTION:DISPLAY",
      `DESCRIPTION:Reminder: ${event.name} starts in 1 hour`,
      "END:VALARM",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    // Set headers for file download
    const filename = `${event.name.replace(/[^a-z0-9]/gi, "_")}_tickets.ics`;
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.send(icsContent);
  } catch (error) {
    console.error("[Calendar] Error generating .ics:", error);
    res.status(500).json({ message: "Could not generate calendar file" });
  }
};

module.exports = { getCalendarEvent };