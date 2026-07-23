const mongoose = require("mongoose");
const Event = require("../models/Event");
const Booking = require("../models/Booking");
const stripe = require("../config/stripe");
const { sendPaymentReminder } = require("../config/email");

// How often the background sweep runs. Needs to be smaller than both
// the reminder window (30s) and the hold window (90s) so neither event
// is missed by more than one tick's worth of delay.
const SWEEP_INTERVAL_MS = 5 * 1000;
const REMINDER_AFTER_MS = 30 * 1000;

/**
 * Finds pending bookings older than 30 seconds that haven't had a
 * reminder sent yet, and emails the buyer a direct Stripe payment link.
 *
 * Why query by `createdAt` (a stored timestamp) instead of an in-memory
 * setTimeout per booking: timestamps survive server restarts. If the
 * dev server crashes and restarts 20 seconds into a booking's hold, the
 * next sweep tick still correctly sees "this booking is now 25 seconds
 * old" and picks up right where it should — a setTimeout scheduled in
 * the old process would simply be gone.
 */
const sendPendingReminders = async () => {
  const reminderCutoff = new Date(Date.now() - REMINDER_AFTER_MS);

  const candidates = await Booking.find({
    status: "pending",
    paymentStatus: "pending",
    reminderSentAt: null,
    createdAt: { $lte: reminderCutoff },
  });

  for (const booking of candidates) {
    try {
      if (!booking.stripeSessionId) continue;

      // Stripe keeps a Checkout Session's hosted URL retrievable for the
      // life of the session, so we don't need to store the URL ourselves.
      const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);

      // If Stripe already shows this as paid, don't send a reminder —
      // confirmBooking just hasn't caught up yet (e.g. buyer paid right
      // at the boundary). Leave it for the normal confirm flow.
      if (session.payment_status === "paid") continue;
      if (!session.url) continue;

      const event = await Event.findById(booking.eventId);
      if (!event) continue;

      await sendPaymentReminder(booking, event, session.url);

      booking.reminderSentAt = new Date();
      await booking.save();

      console.log(`[Scheduler] Sent payment reminder for booking ${booking._id}`);
    } catch (err) {
      // One booking failing (bad email, Stripe hiccup) should never stop
      // the rest of the sweep from running.
      console.error(`[Scheduler] Reminder failed for booking ${booking._id}:`, err.message);
    }
  }
};

/**
 * Manually expires a booking's Stripe Checkout Session.
 *
 * WHY THIS EXISTS: Stripe's own `expires_at` on a Checkout Session can't
 * be set below 30 minutes — there is no way to give Stripe a 90-second
 * expiry directly at session-creation time. That means our DB-side hold
 * window (90s) and Stripe's own session lifetime were previously out of
 * sync: our `Booking.expiresAt` would pass and we'd mark the booking
 * "expired" + release the tickets, but the Stripe-hosted payment page
 * stayed live for up to 24h. A buyer who still had that tab open (or
 * revisited the old link) could complete payment and get charged for
 * tickets we'd already released to someone else.
 *
 * Calling `stripe.checkout.sessions.expire()` here tells Stripe to kill
 * the session the moment we release it on our side, so the hosted page
 * immediately starts showing "This session has expired" and blocks
 * payment. This keeps our DB and Stripe in sync at the same 90s mark.
 *
 * Deliberately called AFTER the DB transaction commits, not inside it:
 * this is a network call to an external API, and a transaction should
 * never be held open across one. Our DB status is the source of truth
 * regardless of whether this call succeeds — if it fails, we log and
 * move on rather than rolling back a booking release that already
 * correctly happened.
 */
const expireStripeSession = async (booking) => {
  if (!booking.stripeSessionId) return;

  try {
    await stripe.checkout.sessions.expire(booking.stripeSessionId);
    console.log(`[Scheduler] Expired Stripe session for booking ${booking._id}`);
  } catch (err) {
    // Expected/harmless cases this can hit:
    // - Session was already paid (buyer beat the scheduler by a hair,
    //   webhook/confirm hasn't caught up yet) — Stripe rejects expiring
    //   a completed session. Fine: confirmBooking() already guards
    //   against confirming an "expired" DB booking (410 Gone).
    // - Session was already expired/cancelled on Stripe's side.
    // Either way, it's safe to just log and continue — never let this
    // throw stop the sweep.
    console.warn(
      `[Scheduler] Could not expire Stripe session for booking ${booking._id}:`,
      err.message,
    );
  }
};

/**
 * Finds pending bookings whose 90-second hold window has passed and
 * releases their held tickets back to inventory, marking the booking
 * "expired". Runs each release inside a transaction — the ticket-count
 * rollback and the status change must both succeed together, mirroring
 * the same atomicity pattern used in createCheckoutSession.
 *
 * After the transaction commits, also expires the Stripe Checkout
 * Session itself (see expireStripeSession above) so the payment link
 * stops working at the same moment the tickets are released.
 */
const releaseExpiredBookings = async () => {
  const now = new Date();

  const candidates = await Booking.find({
    status: "pending",
    paymentStatus: "pending",
    expiresAt: { $lte: now },
  });

  for (const booking of candidates) {
    const session = await mongoose.startSession();
    let released = false;
    try {
      session.startTransaction();

      const event = await Event.findOne({
        _id: booking.eventId,
        organizationId: booking.organizationId,
      }).session(session);

      if (event && booking.selectedSeats?.length) {
        for (const reference of booking.selectedSeats) {
          const seat = event.selectedSeatMap?.blocks?.find((block) => block.id === reference.blockId)?.seats?.find((item) => item.id === reference.seatId);
          if (seat?.status === "checkout-held") seat.status = "available";
        }
        event.markModified("selectedSeatMap");
        await event.save({ session });
      } else if (event) {
        for (const item of booking.items) {
          const ticketType = event.ticketTypes[item.ticketTypeIndex];
          if (!ticketType) continue;

          // Release exactly what this booking had held — never below 0,
          // in case of any prior manual correction.
          ticketType.quantityBooked = Math.max(
            0,
            Number(ticketType.quantityBooked || 0) - item.quantity,
          );
        }
        event.markModified("ticketTypes");
        await event.save({ session });
      }

      booking.status = "expired";
      await booking.save({ session });

      await session.commitTransaction();
      released = true;
      console.log(`[Scheduler] Released expired booking ${booking._id} — tickets returned to inventory`);
    } catch (err) {
      await session.abortTransaction();
      console.error(`[Scheduler] Failed to release booking ${booking._id}:`, err.message);
    } finally {
      session.endSession();
    }

    // Outside the transaction/finally block on purpose — this is a
    // separate external-API concern from the DB release above, and
    // should only run once the DB release actually succeeded.
    if (released) {
      await expireStripeSession(booking);
    }
  }
};

const runSweep = async () => {
  try {
    await sendPendingReminders();
    await releaseExpiredBookings();
  } catch (err) {
    // Should be unreachable (each function already catches its own
    // per-booking errors), but guards against the sweep itself dying.
    console.error("[Scheduler] Sweep failed:", err.message);
  }
};

/**
 * Starts the periodic background sweep. Call this once, from
 * server.js, after the DB connection is established.
 */
const startBookingScheduler = () => {
  console.log(
    `[Scheduler] Booking scheduler started — sweeping every ${SWEEP_INTERVAL_MS / 1000}s`,
  );
  setInterval(runSweep, SWEEP_INTERVAL_MS);
};

module.exports = { startBookingScheduler, sendPendingReminders, releaseExpiredBookings };
