const crypto = require("crypto");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const Event = require("../models/Event");
const Booking = require("../models/Booking");
const stripe = require("../config/stripe");
const { sendBookingConfirmation } = require("../config/email");
const walletService = require("./wallet.service");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// How long a pending booking holds its tickets before the scheduler
// releases them back to inventory. See services/bookingScheduler.js.
const HOLD_DURATION_MS = 90 * 1000; // 90 seconds (1:30)

const generateConfirmationCode = () => {
  const randomPart = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `BK-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
};

const parseCheckoutItems = (items) => {
  if (!items) {
    const error = new Error("items are required");
    error.statusCode = 400;
    throw error;
  }

  const parsedItems = typeof items === "string" ? JSON.parse(items) : items;

  if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
    const error = new Error("items must be a non-empty array");
    error.statusCode = 400;
    throw error;
  }

  const groupedItems = new Map();

  for (const item of parsedItems) {
    const ticketTypeIndex = Number(item.ticketTypeIndex);
    const quantity = Number(item.quantity);

    if (!Number.isInteger(ticketTypeIndex) || ticketTypeIndex < 0) {
      const error = new Error("Each item needs a valid ticketTypeIndex");
      error.statusCode = 400;
      throw error;
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      const error = new Error("Each item quantity must be at least 1");
      error.statusCode = 400;
      throw error;
    }

    const currentQuantity = groupedItems.get(ticketTypeIndex) || 0;
    groupedItems.set(ticketTypeIndex, currentQuantity + quantity);
  }

  return Array.from(groupedItems.entries()).map(
    ([ticketTypeIndex, quantity]) => ({
      ticketTypeIndex,
      quantity,
    }),
  );
};

const createSeatmapCheckout = async (eventId, organizationId, orgSlug, data) => {
  const { buyerName, buyerEmail, items, useWallet, walletDeduction } = data;
  if (!buyerName || !buyerEmail || !Array.isArray(items) || !items.length) { const error = new Error("buyerName, buyerEmail and selected seats are required"); error.statusCode = 400; throw error; }
  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();
    const event = await Event.findOne({ _id: eventId, organizationId, purchaseMode: "seatmap" }).session(dbSession);
    if (!event?.selectedSeatMap) { const error = new Error("Seat map is not configured for this event"); error.statusCode = 400; throw error; }
    const seen = new Set(); const selectedSeats = []; let totalAmount = 0;
    for (const request of items) {
      const key = `${request.blockId}:${request.seatId}`; if (seen.has(key)) continue; seen.add(key);
      const block = event.selectedSeatMap.blocks?.find((item) => item.id === request.blockId); const seat = block?.seats?.find((item) => item.id === request.seatId);
      if (!block || !seat || seat.status !== "available") { const error = new Error("One or more seats are no longer available"); error.statusCode = 409; throw error; }
      const unitPrice = Number(block.price || 0); seat.status = "checkout-held"; selectedSeats.push({ blockId: block.id, seatId: seat.id, seatName: seat.seatName, sectionName: block.name, category: block.category || null, unitPrice }); totalAmount += unitPrice;
    }
    if (!selectedSeats.length) { const error = new Error("Select at least one seat"); error.statusCode = 400; throw error; }
    const walletAmount = useWallet ? Math.min(Number(walletDeduction || 0), totalAmount) : 0;
    const [booking] = await Booking.create([{ organizationId, eventId, eventName: event.name, eventDateTime: event.dateTime, buyerName: buyerName.trim(), buyerEmail: buyerEmail.trim().toLowerCase(), items: selectedSeats.map((seat) => ({ ticketTypeName: `${seat.sectionName} — ${seat.seatName}`, quantity: 1, unitPrice: seat.unitPrice, lineTotal: seat.unitPrice })), selectedSeats, totalAmount: totalAmount - walletAmount, originalAmount: totalAmount, walletDeduction: walletAmount, walletDeductionPending: walletAmount, currency: "PKR", status: "pending", paymentStatus: "pending", confirmationCode: generateConfirmationCode(), expiresAt: new Date(Date.now() + HOLD_DURATION_MS) }], { session: dbSession });
    event.markModified("selectedSeatMap"); await event.save({ session: dbSession });
    const paymentRatio = totalAmount ? (totalAmount - walletAmount) / totalAmount : 1;
    const stripeItems = selectedSeats.map((seat) => ({ price_data: { currency: "pkr", product_data: { name: `${event.name} — ${seat.sectionName} ${seat.seatName}` }, unit_amount: Math.max(1, Math.round(seat.unitPrice * 100 * paymentRatio)) }, quantity: 1 }));
    const stripeSession = await stripe.checkout.sessions.create({ payment_method_types: ["card"], mode: "payment", customer_email: booking.buyerEmail, client_reference_id: booking._id.toString(), metadata: { bookingId: booking._id.toString(), eventId: String(eventId), organizationId: String(organizationId), purchaseMode: "seatmap", useWallet: useWallet ? "true" : "false", walletDeduction: String(walletAmount) }, line_items: stripeItems, success_url: `${FRONTEND_URL}/o/${orgSlug}/bookings/${booking._id}/confirmation?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${FRONTEND_URL}/o/${orgSlug}/events/${eventId}` }, { idempotencyKey: `seatmap-${booking._id}` });
    booking.stripeSessionId = stripeSession.id; await booking.save({ session: dbSession }); await dbSession.commitTransaction(); return { bookingId: booking._id, stripeSessionId: stripeSession.id, stripeUrl: stripeSession.url };
  } catch (error) { await dbSession.abortTransaction(); throw error; } finally { dbSession.endSession(); }
};

/**
 * Create a pending booking and generate a Stripe Checkout Session.
 * IDEMPOTENT: If a pending booking already exists for this buyer + event,
 * we return the EXISTING Stripe session URL instead of creating a new one.
 * This prevents double charges if the buyer clicks "Pay" twice.
 */
const createCheckoutSession = async (eventId, organizationId, orgSlug, data) => {
  if (Array.isArray(data.items) && data.items.some((item) => item.blockId && item.seatId)) {
    return createSeatmapCheckout(eventId, organizationId, orgSlug, data);
  }
  const { buyerName, buyerEmail, items, cartKey, useWallet, walletDeduction } = data;

  if (!buyerName || !buyerEmail) {
    const error = new Error("buyerName and buyerEmail are required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = buyerEmail.trim().toLowerCase();

  // ─── IDEMPOTENCY CHECK ───────────────────────────────────────────────
  // Check if there's ALREADY a pending booking for this buyer + event.
  // If yes, and the Stripe session is still valid, return the same session
  // instead of creating a new one — prevents double charges.
  //
  // IMPORTANT: must filter by BOTH status AND paymentStatus. A booking
  // that the scheduler already released (status: "expired") still has
  // paymentStatus: "pending" (payment never happened) — without the
  // status filter here too, an expired booking's stale Stripe session
  // would incorrectly be treated as "still active" and handed back to
  // the buyer, even though its tickets were already returned to
  // inventory.
  const existingPendingBooking = await Booking.findOne({
    eventId,
    buyerEmail: normalizedEmail,
    status: "pending",
    paymentStatus: "pending",
  });

  if (existingPendingBooking && existingPendingBooking.stripeSessionId) {
    try {
      const existingSession = await stripe.checkout.sessions.retrieve(
        existingPendingBooking.stripeSessionId,
      );

      // If the session is still open or requires payment, return it
      if (
        existingSession.status === "open" ||
        existingSession.status === "requires_payment"
      ) {
        console.log(
          `[Idempotency] Returning existing session ${existingSession.id} for ` +
          `booking ${existingPendingBooking._id} (buyer: ${normalizedEmail})`,
        );
        return {
          bookingId: existingPendingBooking._id,
          stripeSessionId: existingSession.id,
          stripeUrl: existingSession.url,
        };
      }

      // If session expired (e.g. 24h passed), create a new one
      if (existingSession.status === "expired") {
        console.log(
          `[Idempotency] Session expired for booking ${existingPendingBooking._id}, creating new one`,
        );
        const newSession = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          customer_email: normalizedEmail,
          client_reference_id: existingPendingBooking._id.toString(),
          metadata: {
            bookingId: existingPendingBooking._id.toString(),
            eventId: eventId.toString(),
            organizationId: organizationId.toString(),
            cartKey: cartKey || "",
          },
          line_items: existingPendingBooking.items.map((item) => ({
            price_data: {
              currency: "pkr",
              product_data: {
                name: `Ticket — ${item.ticketTypeName}`,
              },
              unit_amount: Math.round(item.unitPrice * 100),
            },
            quantity: item.quantity,
          })),
          success_url: `${FRONTEND_URL}/o/${orgSlug}/bookings/${existingPendingBooking._id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${FRONTEND_URL}/o/${orgSlug}/cart/${eventId}`,
        });

        existingPendingBooking.stripeSessionId = newSession.id;
        // Fresh Stripe session = fresh hold window. Also reset the
        // reminder flag so the buyer gets a new reminder if they stall
        // again on this new session.
        existingPendingBooking.expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
        existingPendingBooking.reminderSentAt = null;
        await existingPendingBooking.save();

        return {
          bookingId: existingPendingBooking._id,
          stripeSessionId: newSession.id,
          stripeUrl: newSession.url,
        };
      }
    } catch (stripeError) {
      // If Stripe API call fails (e.g., session not found in Stripe),
      // log and continue to create a fresh booking
      console.error(
        `[Idempotency] Stripe lookup failed for session ${existingPendingBooking.stripeSessionId}:`,
        stripeError.message,
      );
    }
  }
  // ─── END IDEMPOTENCY CHECK ──────────────────────────────────────────

  const checkoutItems = parseCheckoutItems(items);

  const mongoSession = await mongoose.startSession();

  try {
    mongoSession.startTransaction();

    const event = await Event.findOne({ _id: eventId, organizationId }).session(
      mongoSession,
    );

    if (!event) {
      const error = new Error("Event not found");
      error.statusCode = 404;
      throw error;
    }

    if (!Array.isArray(event.ticketTypes) || event.ticketTypes.length === 0) {
      const error = new Error("This event has no ticket types available");
      error.statusCode = 400;
      throw error;
    }

    const bookingItems = [];
    let totalAmount = 0;
    const stripeLineItems = [];

    for (const checkoutItem of checkoutItems) {
      const ticketType = event.ticketTypes[checkoutItem.ticketTypeIndex];

      if (!ticketType) {
        const error = new Error(
          `Invalid ticketTypeIndex: ${checkoutItem.ticketTypeIndex}`,
        );
        error.statusCode = 400;
        throw error;
      }

      const remaining =
        Number(ticketType.quantityTotal) -
        Number(ticketType.quantityBooked || 0);

      if (checkoutItem.quantity > remaining) {
        const error = new Error(
          `Not enough tickets left for ${ticketType.name}`,
        );
        error.statusCode = 409;
        throw error;
      }

      // Atomically decrement available quantity inside the transaction
      ticketType.quantityBooked =
        Number(ticketType.quantityBooked || 0) + checkoutItem.quantity;

      const unitPrice = Number(ticketType.price);
      const lineTotal = unitPrice * checkoutItem.quantity;

      bookingItems.push({
        ticketTypeName: ticketType.name,
        ticketTypeIndex: checkoutItem.ticketTypeIndex,
        quantity: checkoutItem.quantity,
        unitPrice,
        lineTotal,
      });

      totalAmount += lineTotal;

      // Stripe expects amounts in cents/paise (smallest currency unit)
      // For PKR, 1 Rupee = 100 paisa, so multiply by 100
      const unitAmount = Math.round(unitPrice * 100);

      stripeLineItems.push({
        price_data: {
          currency: "pkr",
          product_data: {
            name: `${event.name} — ${ticketType.name}`,
            description: `${checkoutItem.quantity} x ${ticketType.name} ticket(s)`,
          },
          unit_amount: unitAmount,
        },
        quantity: checkoutItem.quantity,
      });
    }

    event.markModified("ticketTypes");
    await event.save({ session: mongoSession });

    const confirmationCode = generateConfirmationCode();

    // Calculate final amount after wallet deduction
    const walletAmount = useWallet && walletDeduction > 0 ? Math.min(walletDeduction, totalAmount) : 0;
    const finalAmount = totalAmount - walletAmount;

    const [booking] = await Booking.create(
      [
        {
          organizationId,
          eventId,
          eventName: event.name,
          eventDateTime: event.dateTime,
          buyerName: buyerName.trim(),
          buyerEmail: normalizedEmail,
          items: bookingItems,
          totalAmount: finalAmount, // Store the amount actually charged
          originalAmount: totalAmount, // Store original amount for reference
          walletDeduction: walletAmount, // Store wallet deduction
          currency: "PKR",
          status: "pending",
          paymentStatus: "pending",
          confirmationCode,
          // This is the hold window the new scheduler enforces:
          // 30s -> reminder email, 90s -> release tickets.
          expiresAt: new Date(Date.now() + HOLD_DURATION_MS),
        },
      ],
      { session: mongoSession },
    );

    // If wallet was used, deduct from wallet immediately
    if (walletAmount > 0) {
      // Note: We need the user ID for wallet deduction, but we only have email at this point
      // The wallet deduction will be handled after booking confirmation
      // For now, we'll store it and deduct later
      booking.walletDeductionPending = walletAmount;
      await booking.save({ session: mongoSession });
    }

    // Adjust line items for Stripe if wallet was used
    // If wallet covered part of the amount, reduce the Stripe charge
    let adjustedStripeLineItems = stripeLineItems;
    if (walletAmount > 0 && walletAmount < totalAmount) {
      // Proportionally reduce line items
      const ratio = (totalAmount - walletAmount) / totalAmount;
      adjustedStripeLineItems = stripeLineItems.map((item) => ({
        ...item,
        quantity: item.quantity, // Keep quantity same
        price_data: {
          ...item.price_data,
          unit_amount: Math.round(item.price_data.unit_amount * ratio),
        },
      }));
    } else if (walletAmount >= totalAmount) {
      // Wallet covered everything - no Stripe charge needed
      // But Stripe requires at least one line item, so we'll create a minimal session
      adjustedStripeLineItems = [
        {
          price_data: {
            currency: "pkr",
            product_data: {
              name: `Wallet Payment - ${event.name}`,
            },
            unit_amount: 100, // Minimum 1 PKR
          },
          quantity: 1,
        },
      ];
    }

    // Stripe idempotency key — extra safety on Stripe's side.
    // Even if we somehow receive the same creation request twice,
    // Stripe will only create one session for this key.
    const idempotencyKey = `checkout-${normalizedEmail}-${eventId}-${booking._id}`;

    // Create Stripe Checkout Session
    const stripeSession = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: normalizedEmail,
        client_reference_id: booking._id.toString(),
        metadata: {
          bookingId: booking._id.toString(),
          eventId: eventId.toString(),
          organizationId: organizationId.toString(),
          cartKey: cartKey || "",
          useWallet: useWallet ? "true" : "false",
          walletDeduction: walletAmount.toString(),
        },
        line_items: adjustedStripeLineItems,
        success_url: `${FRONTEND_URL}/o/${orgSlug}/bookings/${booking._id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/o/${orgSlug}/cart/${eventId}`,
      },
      { idempotencyKey },
    );

    // Save the Stripe session ID on the booking
    booking.stripeSessionId = stripeSession.id;
    await booking.save({ session: mongoSession });

    await mongoSession.commitTransaction();

    return {
      bookingId: booking._id,
      stripeSessionId: stripeSession.id,
      stripeUrl: stripeSession.url,
    };
  } catch (error) {
    await mongoSession.abortTransaction();
    throw error;
  } finally {
    mongoSession.endSession();
  }
};

/**
 * Confirm a booking after successful Stripe payment.
 * IDEMPOTENT: If already confirmed, returns immediately without changes.
 * Called from the success page (via session_id lookup) or webhook.
 */
const confirmBooking = async (stripeSessionId) => {
  const booking = await Booking.findOne({ stripeSessionId });

  if (!booking) {
    const error = new Error("Booking not found for this session");
    error.statusCode = 404;
    throw error;
  }

  // ─── IDEMPOTENCY CHECK ───────────────────────────────────────────────
  // If booking is already confirmed, return as-is — no double charge
  if (booking.status === "confirmed" && booking.paymentStatus === "paid") {
    console.log(
      `[Idempotency] Booking ${booking._id} already confirmed — skipping`,
    );
    return booking;
  }
  // ─── END IDEMPOTENCY CHECK ──────────────────────────────────────────

  // If the scheduler already released this booking's tickets (expired),
  // it can no longer be confirmed — the buyer needs to start a fresh
  // checkout. This can happen if Stripe payment succeeds a moment after
  // our 90s window already fired.
  if (booking.status === "expired") {
    const error = new Error(
      "This booking has expired and its tickets were released. Please start a new checkout.",
    );
    error.statusCode = 410; // Gone
    throw error;
  }

  // Verify payment status with Stripe — ensure payment actually happened
  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

  if (session.payment_status !== "paid") {
    const error = new Error("Payment has not been completed yet");
    error.statusCode = 400;
    throw error;
  }

  // Generate QR code data URL
  const qrData = JSON.stringify({
    bookingId: booking._id.toString(),
    confirmationCode: booking.confirmationCode,
    eventId: booking.eventId.toString(),
    buyerEmail: booking.buyerEmail,
  });

  let qrCodeUrl = null;
  try {
    qrCodeUrl = await QRCode.toDataURL(qrData);
  } catch (qrError) {
    // QR generation failure should not block the confirmation
    console.error("QR Code generation failed:", qrError.message);
  }

  booking.status = "confirmed";
  booking.paymentStatus = "paid";
  booking.qrCodeUrl = qrCodeUrl;
  if (booking.selectedSeats?.length) {
    const seatEvent = await Event.findOne({ _id: booking.eventId, organizationId: booking.organizationId });
    for (const reference of booking.selectedSeats) {
      const seat = seatEvent?.selectedSeatMap?.blocks?.find((block) => block.id === reference.blockId)?.seats?.find((item) => item.id === reference.seatId);
      if (seat?.status === "checkout-held") seat.status = "sold";
    }
    if (seatEvent) { seatEvent.markModified("selectedSeatMap"); await seatEvent.save(); }
  }
  await booking.save();

  // If wallet was used, deduct from wallet now
  if (booking.walletDeductionPending > 0) {
    try {
      // Find user by email to get userId
      const User = require("../models/User");
      const user = await User.findOne({ email: booking.buyerEmail });
      if (user) {
        await walletService.debit(
          user._id,
          booking.walletDeductionPending,
          `Wallet payment for ${booking.confirmationCode}`,
          { type: "purchase", bookingId: booking._id }
        );
        booking.walletDeductionPending = 0;
        await booking.save();
      }
    } catch (walletError) {
      console.error("Wallet deduction failed:", walletError.message);
      // Don't fail the booking if wallet deduction fails
    }
  }

  // Send confirmation email in background (don't block if email fails)
  try {
    const event = await Event.findById(booking.eventId).populate("venueId", "name address city");
    if (event) {
      await sendBookingConfirmation(booking, event, qrCodeUrl, booking.organizationId);
    }
  } catch (emailError) {
    console.error("Confirmation email failed:", emailError.message);
  }

  return booking;
};

/**
 * Atomically releases a booking's held tickets and marks it "expired".
 *
 * This mirrors the exact same transaction pattern used by
 * `services/bookingScheduler.js#releaseExpiredBookings` — it exists here
 * as a second entry point into the *same* release logic, triggered by an
 * incoming `checkout.session.expired` Stripe webhook event instead of the
 * periodic 5s sweep.
 *
 * WHY THIS IS NEEDED: since our scheduler now calls
 * `stripe.checkout.sessions.expire()` the moment it releases a booking
 * (see bookingScheduler.js), Stripe fires a `checkout.session.expired`
 * event back at us. This handler makes sure that event is never silently
 * dropped — even though in the common case the scheduler has *already*
 * marked the booking "expired" by the time this webhook arrives (so this
 * is a no-op safety net), it also correctly handles the rarer case where
 * Stripe's own 30-minute-minimum session naturally expires on its own
 * (independent of our 90s hold) before our scheduler ever touches that
 * booking — in that scenario, this is the ONLY thing that releases the
 * held tickets.
 *
 * Safe to call for a booking that's already "expired" or "confirmed" —
 * it simply does nothing in those cases.
 */
const expireBookingIfStillPending = async (booking) => {
  if (booking.status !== "pending") {
    // Already handled — either the scheduler beat this webhook to it
    // ("expired"), or the payment actually succeeded just before Stripe
    // considered the session expired ("confirmed"). Nothing to do.
    console.log(
      `[Webhook] Booking ${booking._id} is already "${booking.status}" — ` +
      `checkout.session.expired is a no-op here`,
    );
    return;
  }

  const session = await mongoose.startSession();
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
    console.log(
      `[Webhook] Released booking ${booking._id} via checkout.session.expired`,
    );
  } catch (err) {
    await session.abortTransaction();
    console.error(
      `[Webhook] Failed to release booking ${booking._id} from webhook:`,
      err.message,
    );
  } finally {
    session.endSession();
  }
};

/**
 * Handle Stripe webhook events.
 *
 * `checkout.session.completed` — IDEMPOTENT: delegates to confirmBooking,
 * which already handles idempotency.
 *
 * `checkout.session.expired` — fired by Stripe whenever a session's
 * lifetime ends, including when we manually call
 * `stripe.checkout.sessions.expire()` from the booking scheduler. Handled
 * here as a safety net so ticket release is never dependent on a single
 * code path (see `expireBookingIfStillPending` above for the full
 * reasoning).
 */
const handleStripeWebhook = async (event) => {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;

    if (bookingId) {
      await confirmBooking(session.id);
    }
  }

  if (event.type === "checkout.session.expired") {
    const session = event.data.object;

    const booking = await Booking.findOne({ stripeSessionId: session.id });

    if (!booking) {
      console.warn(
        `[Webhook] checkout.session.expired received for unknown session ${session.id}`,
      );
      return { received: true };
    }

    await expireBookingIfStillPending(booking);
  }

  return { received: true };
};

/**
 * Get a single booking by ID (tenant-scoped).
 */
const getBooking = async (bookingId, organizationId) => {
  const booking = await Booking.findOne({
    _id: bookingId,
    organizationId,
  }).populate("eventId", "name dateTime venueId");

  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  return booking;
};

/**
 * Get all bookings for an event (tenant-scoped).
 */
const getEventBookings = async (eventId, organizationId) => {
  return Booking.find({ eventId, organizationId })
    .sort({ createdAt: -1 })
    .lean();
};

/**
 * Original createBooking (for direct booking without Stripe).
 * Used as a fallback or for non-payment bookings.
 */
const createBooking = async (eventId, organizationId, data) => {
  const { buyerName, buyerEmail, items } = data;

  if (!buyerName || !buyerEmail) {
    const error = new Error("buyerName and buyerEmail are required");
    error.statusCode = 400;
    throw error;
  }

  const checkoutItems = parseCheckoutItems(items);

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const event = await Event.findOne({ _id: eventId, organizationId }).session(
      session,
    );

    if (!event) {
      const error = new Error("Event not found");
      error.statusCode = 404;
      throw error;
    }

    if (!Array.isArray(event.ticketTypes) || event.ticketTypes.length === 0) {
      const error = new Error("This event has no ticket types available");
      error.statusCode = 400;
      throw error;
    }

    const bookingItems = [];
    let totalAmount = 0;

    for (const checkoutItem of checkoutItems) {
      const ticketType = event.ticketTypes[checkoutItem.ticketTypeIndex];

      if (!ticketType) {
        const error = new Error(
          `Invalid ticketTypeIndex: ${checkoutItem.ticketTypeIndex}`,
        );
        error.statusCode = 400;
        throw error;
      }

      const remaining =
        Number(ticketType.quantityTotal) -
        Number(ticketType.quantityBooked || 0);

      if (checkoutItem.quantity > remaining) {
        const error = new Error(
          `Not enough tickets left for ${ticketType.name}`,
        );
        error.statusCode = 409;
        throw error;
      }

      ticketType.quantityBooked =
        Number(ticketType.quantityBooked || 0) + checkoutItem.quantity;

      const unitPrice = Number(ticketType.price);
      const lineTotal = unitPrice * checkoutItem.quantity;

      bookingItems.push({
        ticketTypeName: ticketType.name,
        ticketTypeIndex: checkoutItem.ticketTypeIndex,
        quantity: checkoutItem.quantity,
        unitPrice,
        lineTotal,
      });

      totalAmount += lineTotal;
    }

    event.markModified("ticketTypes");
    await event.save({ session });

    const confirmationCode = generateConfirmationCode();

    const [booking] = await Booking.create(
      [
        {
          organizationId,
          eventId,
          eventName: event.name,
          eventDateTime: event.dateTime,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim().toLowerCase(),
          items: bookingItems,
          totalAmount,
          currency: "PKR",
          status: "pending",
          paymentStatus: "pending",
          confirmationCode,
        },
      ],
      { session },
    );

    await session.commitTransaction();

    return booking;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  createBooking,
  createCheckoutSession,
  confirmBooking,
  handleStripeWebhook,
  getBooking,
  getEventBookings,
  HOLD_DURATION_MS,
};
