/*
 * Repairs historical bookings created before unified cart checkout preserved
 * the selected event-session date. Safe to run multiple times: only bookings
 * with a valid sessionId and a different stored eventDateTime are updated.
 *
 * Run: npm run migrate:booking-session-dates
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../src/config/db");
const Booking = require("../src/models/Booking");
const Event = require("../src/models/Event");

const sameInstant = (left, right) => left && right && new Date(left).getTime() === new Date(right).getTime();

const run = async () => {
  await connectDB();
  const bookings = await Booking.find({ sessionId: { $ne: null } }).select("_id eventId sessionId eventDateTime").lean();
  let updated = 0;
  let skipped = 0;

  for (const booking of bookings) {
    const event = await Event.findById(booking.eventId).select("sessions").lean();
    const session = event?.sessions?.find((item) => String(item._id) === String(booking.sessionId));
    if (!session?.dateTime || sameInstant(booking.eventDateTime, session.dateTime)) {
      skipped += 1;
      continue;
    }
    await Booking.updateOne({ _id: booking._id }, { $set: { eventDateTime: session.dateTime } });
    updated += 1;
  }

  console.log(`Booking session-date backfill complete: ${updated} updated, ${skipped} unchanged.`);
  await mongoose.connection.close();
};

run().catch(async (error) => {
  console.error("Booking session-date backfill failed:", error);
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
