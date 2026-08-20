const mongoose = require("mongoose");
const Event = require("../models/Event");
const Booking = require("../models/Booking");
const Cart = require("../models/Cart");
const stripe = require("../config/stripe");
const { sendUnifiedPaymentReminder } = require("../config/email");
const { paymentTrace, bookingContext } = require("../utils/paymentTrace");
const { notifyOrganizationBookingUpdate } = require("./organizationUpdate.service");
const { notifyUser } = require("./notification.service");
const User = require("../models/User");

// How often the background sweep runs. Needs to be smaller than both
// the reminder window (5m) and the hold window (30m) so neither event
// is missed by more than one tick's worth of delay.
const SWEEP_INTERVAL_MS = 5 * 1000;
const REMINDER_AFTER_MS = 5 * 60 * 1000;

/**
 * Finds pending bookings older than five minutes that haven't had a
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

  const sessionIds = [...new Set(candidates.map((booking) => booking.stripeSessionId).filter(Boolean))];
  for (const stripeSessionId of sessionIds) {
    try {
      // Atomically claim every still-unsent booking in this checkout before
      // contacting Stripe/email. A later 5-second sweep will see the lease
      // and skip this session instead of duplicating the reminder.
      const claimTime = new Date();
      const staleLeaseCutoff = new Date(Date.now() - 5 * 60 * 1000);
      const claim = await Booking.updateMany(
        {
          stripeSessionId,
          status: "pending",
          paymentStatus: "pending",
          reminderSentAt: null,
          $or: [{ reminderSendingAt: null }, { reminderSendingAt: { $lte: staleLeaseCutoff } }],
        },
        { $set: { reminderSendingAt: claimTime } },
      );
      if (!claim.modifiedCount) continue;
      const bookings = await Booking.find({ stripeSessionId, status: "pending", paymentStatus: "pending" });
      if (!bookings.length || bookings.every((booking) => booking.reminderSentAt)) continue;

      // Stripe keeps a Checkout Session's hosted URL retrievable for the
      // life of the session, so we don't need to store the URL ourselves.
      const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

      // If Stripe already shows this as paid, don't send a reminder —
      // confirmBooking just hasn't caught up yet (e.g. buyer paid right
      // at the boundary). Leave it for the normal confirm flow.
      if (session.payment_status === "paid") continue;
      if (!session.url) continue;

      await sendUnifiedPaymentReminder(bookings, session.url);
      await Booking.updateMany(
        { _id: { $in: bookings.map((booking) => booking._id) }, reminderSentAt: null, reminderSendingAt: claimTime },
        { $set: { reminderSentAt: new Date() }, $unset: { reminderSendingAt: "" } },
      );

      paymentTrace("payment-reminder-sent", {
        stripeSessionId,
        bookingIds: bookings.map((booking) => booking._id.toString()),
        bookingCount: bookings.length,
        buyer: bookings[0] ? bookingContext(bookings[0]).buyer : undefined,
      });
      console.log(`[Scheduler] Sent one payment reminder for checkout ${stripeSessionId}`);
    } catch (err) {
      await Booking.updateMany(
        { stripeSessionId, reminderSentAt: null },
        { $unset: { reminderSendingAt: "" } },
      ).catch(() => {});
      paymentTrace("payment-reminder-failed", { stripeSessionId, error: err.message }, "error");
      // One booking failing (bad email, Stripe hiccup) should never stop
      // the rest of the sweep from running.
      console.error(`[Scheduler] Reminder failed for checkout ${stripeSessionId}:`, err.message);
    }
  }
};

/**
 * Manually expires a booking's Stripe Checkout Session.
 *
 * WHY THIS EXISTS: Stripe's own `expires_at` on a Checkout Session can't
 * be set below 30 minutes. Our DB-side hold window is also 30 minutes, but
 * we still explicitly expire the Stripe session so both systems remain in
 * sync: our `Booking.expiresAt` would pass and we'd mark the booking
 * "expired" + release the tickets, but the Stripe-hosted payment page
 * stayed live for up to 24h. A buyer who still had that tab open (or
 * revisited the old link) could complete payment and get charged for
 * tickets we'd already released to someone else.
 *
 * Calling `stripe.checkout.sessions.expire()` here tells Stripe to kill
 * the session the moment we release it on our side, so the hosted page
 * immediately starts showing "This session has expired" and blocks
 * payment. This keeps our DB and Stripe in sync at the same expiry mark.
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
    paymentTrace("stripe-session-expired-by-scheduler", bookingContext(booking), "warn");
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
 * Finds pending bookings whose 30-minute hold window has passed and
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
        // Determine the correct seat map to release seats from.
        // Seatmap bookings may be tied to a specific session, so we must
        // check the session's seat map first (same logic as in confirmBooking).
        let targetSeatMap = event.selectedSeatMap;
        let sessionDoc = null;
        if (booking.sessionId && event.sessions && event.sessions.length > 0) {
          sessionDoc = event.sessions.find(s => String(s._id) === String(booking.sessionId));
          if (sessionDoc) {
            targetSeatMap = sessionDoc.selectedSeatMap;
          }
        }
        for (const reference of booking.selectedSeats) {
          const seat = targetSeatMap?.blocks?.find((block) => block.id === reference.blockId)?.seats?.find((item) => item.id === reference.seatId);
          if (seat?.status === "checkout-held") seat.status = "available";
        }
        if (sessionDoc) {
          sessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
          event.markModified("sessions");
        } else {
          event.markModified("selectedSeatMap");
        }
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
      paymentTrace("booking-hold-released", bookingContext(booking), "warn");
      notifyOrganizationBookingUpdate(booking.organizationId, { type: "booking-expired", bookingId: booking._id.toString() });
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

const releaseExpiredCarts = async () => {
  const now = new Date();
  const expiredCarts = await Cart.find({ expiresAt: { $lte: now } });

  for (const cart of expiredCarts) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      // Release regular cart seats and every seat stored inside a bundle cart item.
      for (const item of cart.items) {
        const seatReferences = item.itemType === "bundle" ? item.bundleSelections : [item];
        for (const reference of seatReferences) {
          if (!reference.blockId || !reference.seatId) continue;
          const event = await Event.findOne({ _id: reference.eventId }).session(session);
          if (event) {
            let targetSeatMap = event.selectedSeatMap;
            let sessionDoc = null;
            if (reference.eventSessionId && event.sessions && event.sessions.length > 0) {
              sessionDoc = event.sessions.find(s => String(s._id) === String(reference.eventSessionId));
              if (sessionDoc) {
                targetSeatMap = sessionDoc.selectedSeatMap;
              }
            }
            if (targetSeatMap) {
              const block = targetSeatMap.blocks?.find(b => b.id === reference.blockId);
              const seat = block?.seats?.find(s => s.id === reference.seatId);
              if (seat && seat.status === "checkout-held") {
                seat.status = "available";
              }

              if (sessionDoc) {
                sessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
                event.markModified("sessions");
              } else {
                event.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
                event.markModified("selectedSeatMap");
              }
              await event.save({ session });
            }
          }
        }
      }

      // Delete the expired cart
      await Cart.deleteOne({ _id: cart._id }).session(session);

      await session.commitTransaction();
      console.log(`[Scheduler] Released expired cart ${cart._id}`);
    } catch (err) {
      await session.abortTransaction();
      console.error(`[Scheduler] Failed to release expired cart ${cart._id}:`, err.message);
    } finally {
      session.endSession();
    }
  }
};

// A seat map is the inventory template/live state for an event session; the
// Cart and pending Booking records are the ownership proof for a temporary
// `checkout-held` seat.  In normal operation releaseExpiredCarts and
// releaseExpiredBookings clear both sides together.  This extra reconciliation
// pass repairs a seat if that ownership record was removed by a failed request,
// an interrupted guest-cart merge, or an old deployment before its paired map
// update completed.  Without it, an orphaned green seat can remain locked
// forever even though no buyer can complete checkout for it.
const seatHoldKey = (eventId, sessionId, blockId, seatId) => (
  `${String(eventId)}:${sessionId ? String(sessionId) : ""}:${String(blockId)}:${String(seatId)}`
);

const eventSeatHoldFallbackKey = (eventId, blockId, seatId) => (
  `${String(eventId)}:*:${String(blockId)}:${String(seatId)}`
);

const addActiveSeatReference = (activeHolds, reference = {}) => {
  const { eventId, eventSessionId, sessionId, blockId, seatId } = reference;
  if (!eventId || !blockId || !seatId) return;

  const resolvedSessionId = eventSessionId || sessionId;
  activeHolds.add(seatHoldKey(eventId, resolvedSessionId, blockId, seatId));

  // Older cart/booking documents can pre-date multi-session support and have
  // no session id.  Keep their seat protected in any matching session rather
  // than risk releasing a valid active hold during the migration period.
  if (!resolvedSessionId) {
    activeHolds.add(eventSeatHoldFallbackKey(eventId, blockId, seatId));
  }
};

const releaseOrphanedSeatHolds = async () => {
  const now = new Date();
  const activeHolds = new Set();
  const confirmedSeatKeys = new Set();

  // A non-expired cart owns seats until checkout starts or the cart expires.
  const activeCarts = await Cart.find({
    expiresAt: { $gt: now },
    "items.0": { $exists: true },
  }).select("items").lean();
  for (const cart of activeCarts) {
    for (const item of cart.items || []) {
      const references = item.itemType === "bundle" ? item.bundleSelections : [item];
      for (const reference of references || []) addActiveSeatReference(activeHolds, reference);
    }
  }

  // Once a buyer reaches Stripe, the pending Booking becomes the ownership
  // proof. Keep those seats held until the same 30-minute expiry window ends.
  const activePendingBookings = await Booking.find({
    status: "pending",
    paymentStatus: "pending",
    expiresAt: { $gt: now },
  }).select("eventId sessionId selectedSeats").lean();
  for (const booking of activePendingBookings) {
    for (const selectedSeat of booking.selectedSeats || []) {
      addActiveSeatReference(activeHolds, {
        ...selectedSeat,
        eventId: booking.eventId,
        sessionId: booking.sessionId,
      });
    }
  }

  // A previous wallet/reward checkout could have persisted the confirmed
  // booking before an older code path changed its seat from checkout-held to
  // sold. Treat confirmed bookings as the final source of truth first: heal
  // their seat rather than ever releasing it as an orphan.
  const confirmedSeatBookings = await Booking.find({
    status: "confirmed",
    paymentStatus: "paid",
    "selectedSeats.0": { $exists: true },
  }).select("eventId sessionId selectedSeats").lean();
  for (const booking of confirmedSeatBookings) {
    for (const selectedSeat of booking.selectedSeats || []) {
      addActiveSeatReference(confirmedSeatKeys, {
        ...selectedSeat,
        eventId: booking.eventId,
        sessionId: booking.sessionId,
      });
    }
  }

  const seatMapEvents = await Event.find({ purchaseMode: "seatmap" }).select("selectedSeatMap sessions");
  let releasedCount = 0;
  let healedSoldCount = 0;

  for (const event of seatMapEvents) {
    let eventChanged = false;
    const releaseFromMap = (seatMap, sessionId) => {
      let mapChanged = false;
      for (const block of seatMap?.blocks || []) {
        for (const seat of block.seats || []) {
          const exactKey = seatHoldKey(event._id, sessionId, block.id, seat.id);
          const fallbackKey = eventSeatHoldFallbackKey(event._id, block.id, seat.id);
          // Repair both old stuck holds and any seat that an older cleanup
          // incorrectly returned to available after its booking was paid.
          // A confirmed booking is authoritative over the visual map state.
          if (confirmedSeatKeys.has(exactKey) || confirmedSeatKeys.has(fallbackKey)) {
            if (seat.status !== "sold" && seat.status !== "organizer-held") {
              seat.status = "sold";
              mapChanged = true;
              healedSoldCount += 1;
            }
            continue;
          }
          if (seat.status !== "checkout-held") continue;
          if (activeHolds.has(exactKey) || activeHolds.has(fallbackKey)) continue;

          seat.status = "available";
          mapChanged = true;
          releasedCount += 1;
        }
      }
      return mapChanged;
    };

    if (releaseFromMap(event.selectedSeatMap, null)) {
      event.markModified("selectedSeatMap");
      eventChanged = true;
    }

    for (const eventSession of event.sessions || []) {
      if (releaseFromMap(eventSession.selectedSeatMap, eventSession._id)) {
        event.markModified("sessions");
        eventChanged = true;
      }
    }

    if (eventChanged) await event.save();
  }

  if (releasedCount) {
    console.warn(`[Scheduler] Released ${releasedCount} orphaned checkout-held seat(s)`);
  }
  if (healedSoldCount) {
    console.warn(`[Scheduler] Marked ${healedSoldCount} confirmed checkout-held seat(s) as sold`);
  }
  return { releasedCount, healedSoldCount };
};

// Stored marker makes this restart-safe and prevents a second reminder on a
// later scheduler tick. A booking made within the final 24h gets one promptly.
const sendUpcomingEventReminders = async () => {
  const now = new Date();
  const until = new Date(now.getTime() + (24 * 60 * 60 * 1000));
  const bookings = await Booking.find({ status: "confirmed", eventDateTime: { $gte: now, $lte: until }, eventReminderSentAt: null }).select("_id userId buyerEmail eventName eventDateTime");
  for (const booking of bookings) {
    const claim = await Booking.findOneAndUpdate({ _id: booking._id, eventReminderSentAt: null }, { $set: { eventReminderSentAt: new Date() } }, { new: true });
    if (!claim) continue;
    const userId = claim.userId || (await User.findOne({ email: claim.buyerEmail }).select("_id").lean())?._id;
    await notifyUser(userId, { type: "event.reminder", title: "Your event is tomorrow", message: `${claim.eventName || "Your event"} starts ${new Date(claim.eventDateTime).toLocaleString()}.`, link: "/my/bookings", metadata: { bookingId: String(claim._id) } });
  }
};

const runSweep = async () => {
  try {
    await sendPendingReminders();
    await releaseExpiredBookings();
    await releaseExpiredCarts();
    await releaseOrphanedSeatHolds();
    await sendUpcomingEventReminders();
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
let schedulerInterval;

const startBookingScheduler = () => {
  if (schedulerInterval) return;
  console.log(
    `[Scheduler] Booking scheduler started — sweeping every ${SWEEP_INTERVAL_MS / 1000}s`,
  );
  // Also reconcile immediately after a restart/deploy. Otherwise an existing
  // orphaned hold can remain visibly green until the first scheduled tick.
  void runSweep();
  schedulerInterval = setInterval(runSweep, SWEEP_INTERVAL_MS);
};

const stopBookingScheduler = () => {
  if (schedulerInterval) clearInterval(schedulerInterval);
  schedulerInterval = undefined;
};

module.exports = {
  startBookingScheduler,
  stopBookingScheduler,
  sendPendingReminders,
  releaseExpiredBookings,
  releaseExpiredCarts,
  releaseOrphanedSeatHolds,
  sendUpcomingEventReminders,
};
