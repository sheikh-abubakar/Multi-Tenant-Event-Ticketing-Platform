const crypto = require("crypto");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const Event = require("../models/Event");
const Booking = require("../models/Booking");
const stripe = require("../config/stripe");
const { sendBookingConfirmation } = require("../config/email");

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

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

/**
 * Create a pending booking and generate a Stripe Checkout Session.
 * This is called when the buyer clicks "Proceed to Checkout".
 */
const createCheckoutSession = async (eventId, organizationId, orgSlug, data) => {
  const { buyerName, buyerEmail, items, cartKey } = data;

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
    await event.save({ session });

    const confirmationCode = generateConfirmationCode();

    const [booking] = await Booking.create(
      [
        {
          organizationId,
          eventId,
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

    // Create Stripe Checkout Session
    const stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      customer_email: buyerEmail.trim().toLowerCase(),
      client_reference_id: booking._id.toString(),
      metadata: {
        bookingId: booking._id.toString(),
        eventId: eventId.toString(),
        organizationId: organizationId.toString(),
        cartKey: cartKey || "",
      },
      line_items: stripeLineItems,
      success_url: `${FRONTEND_URL}/o/${orgSlug}/bookings/${booking._id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/o/${orgSlug}/cart/${eventId}`,
    });

    // Save the Stripe session ID on the booking
    booking.stripeSessionId = stripeSession.id;
    await booking.save({ session });

    await session.commitTransaction();

    return {
      bookingId: booking._id,
      stripeSessionId: stripeSession.id,
      stripeUrl: stripeSession.url,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Confirm a booking after successful Stripe payment.
 * Called from the success page (via session_id lookup) or webhook.
 */
const confirmBooking = async (stripeSessionId) => {
  const booking = await Booking.findOne({ stripeSessionId });

  if (!booking) {
    const error = new Error("Booking not found for this session");
    error.statusCode = 404;
    throw error;
  }

  // Idempotency: if already confirmed, return as-is
  if (booking.status === "confirmed" && booking.paymentStatus === "paid") {
    return booking;
  }

  // Verify payment status with Stripe
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
  await booking.save();

  // Send confirmation email in background (don't block if email fails)
  try {
    const event = await Event.findById(booking.eventId);
    if (event) {
      await sendBookingConfirmation(booking, event, qrCodeUrl);
    }
  } catch (emailError) {
    console.error("Confirmation email failed:", emailError.message);
  }

  return booking;
};

/**
 * Handle Stripe webhook event: checkout.session.completed
 */
const handleStripeWebhook = async (event) => {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = session.metadata?.bookingId;

    if (bookingId) {
      await confirmBooking(session.id);
    }
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
};