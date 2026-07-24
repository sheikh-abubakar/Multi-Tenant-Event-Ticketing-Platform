const crypto = require("crypto");
const mongoose = require("mongoose");
const QRCode = require("qrcode");
const Event = require("../models/Event");
const Booking = require("../models/Booking");
const User = require("../models/User");
const stripe = require("../config/stripe");
const { sendBookingConfirmation } = require("../config/email");
const walletService = require("./wallet.service");
const referralService = require("./referral.service");
const couponService = require("./coupon.service");


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

const calculateDiscounts = async (organizationId, eventId, totalAmount, data) => {
  const { couponCode, rewardsToApply, userId } = data;
  const requestedRewardsCount = rewardsToApply ? parseInt(rewardsToApply, 10) : 0;

  let couponDiscountAmount = 0;
  let appliedCouponCode = null;

  if (couponCode && String(couponCode).trim()) {
    try {
      const couponResult = await couponService.validateAndApplyCoupon(
        organizationId,
        eventId,
        couponCode,
        totalAmount
      );
      couponDiscountAmount = couponResult.discountAmount;
      appliedCouponCode = couponResult.code;
    } catch (err) {
      console.error("Coupon validation error during checkout:", err.message);
      const error = new Error(err.message || "Invalid coupon code");
      error.statusCode = err.statusCode || 400;
      throw error;
    }
  }

  // Calculate referral discount ONLY if no coupon was applied (no stacking)
  let referralDiscountAmount = 0;
  let rewardsUsedCount = 0;
  if (!appliedCouponCode && requestedRewardsCount > 0 && userId) {
    try {
      const refDiscount = await referralService.calculateReferralDiscount(
        userId,
        requestedRewardsCount,
        totalAmount
      );
      referralDiscountAmount = refDiscount.discountAmount;
      rewardsUsedCount = refDiscount.rewardsToApplyCount;
    } catch (err) {
      console.error("Referral discount calculation error:", err.message);
    }
  }

  return {
    couponCode: appliedCouponCode,
    couponDiscountAmount,
    referralDiscountAmount,
    referralRewardsUsedCount: rewardsUsedCount,
  };
};

const createSeatmapCheckout = async (eventId, organizationId, orgSlug, data) => {
  const { buyerName, buyerEmail, items, useWallet, walletDeduction, refCode, couponCode, rewardsToApply, userId } = data;
  if (!buyerName || !buyerEmail || !Array.isArray(items) || !items.length) {
    const error = new Error("buyerName, buyerEmail and selected seats are required");
    error.statusCode = 400;
    throw error;
  }
  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();
    const event = await Event.findOne({ _id: eventId, organizationId, purchaseMode: "seatmap" }).session(dbSession);
    if (!event?.selectedSeatMap) {
      const error = new Error("Seat map is not configured for this event");
      error.statusCode = 400;
      throw error;
    }
    const seen = new Set();
    const selectedSeats = [];
    let totalAmount = 0;
    for (const request of items) {
      const key = `${request.blockId}:${request.seatId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const block = event.selectedSeatMap.blocks?.find((item) => item.id === request.blockId);
      const seat = block?.seats?.find((item) => item.id === request.seatId);
      if (!block || !seat || seat.status !== "available") {
        const error = new Error("One or more seats are no longer available");
        error.statusCode = 409;
        throw error;
      }
      const unitPrice = Number(block.price || 0);
      seat.status = "checkout-held";
      selectedSeats.push({
        blockId: block.id,
        seatId: seat.id,
        seatName: seat.seatName,
        sectionName: block.name,
        category: block.category || null,
        unitPrice,
      });
      totalAmount += unitPrice;
    }
    if (!selectedSeats.length) {
      const error = new Error("Select at least one seat");
      error.statusCode = 400;
      throw error;
    }

    // Calculate coupon & referral discounts
    const discountRes = await calculateDiscounts(organizationId, eventId, totalAmount, {
      couponCode,
      rewardsToApply,
      userId,
    });

    const totalDiscount = discountRes.couponDiscountAmount + discountRes.referralDiscountAmount;
    const cleanRefCode = refCode ? String(refCode).trim() : null;
    const walletAmount = useWallet ? Math.min(Number(walletDeduction || 0), Math.max(0, totalAmount - totalDiscount)) : 0;
    const finalAmount = Math.max(0, totalAmount - walletAmount - totalDiscount);

    const [booking] = await Booking.create(
      [
        {
          organizationId,
          eventId,
          eventName: event.name,
          eventDateTime: event.dateTime,
          buyerName: buyerName.trim(),
          buyerEmail: buyerEmail.trim().toLowerCase(),
          items: selectedSeats.map((seat) => ({
            ticketTypeName: `${seat.sectionName} — ${seat.seatName}`,
            quantity: 1,
            unitPrice: seat.unitPrice,
            lineTotal: seat.unitPrice,
          })),
          selectedSeats,
          totalAmount: finalAmount,
          originalAmount: totalAmount,
          walletDeduction: walletAmount,
          walletDeductionPending: walletAmount,
          referredByCode: cleanRefCode,
          referralRewardsUsedCount: discountRes.referralRewardsUsedCount,
          discountAmount: discountRes.referralDiscountAmount,
          couponCode: discountRes.couponCode,
          couponDiscountAmount: discountRes.couponDiscountAmount,
          currency: "PKR",
          status: "pending",
          paymentStatus: "pending",
          confirmationCode: generateConfirmationCode(),
          expiresAt: new Date(Date.now() + HOLD_DURATION_MS),
        },
      ],
      { session: dbSession },
    );
    event.markModified("selectedSeatMap");
    await event.save({ session: dbSession });

    const paymentRatio = totalAmount ? finalAmount / totalAmount : 1;
    const stripeItems = selectedSeats.map((seat) => ({
      price_data: {
        currency: "pkr",
        product_data: { name: `${event.name} — ${seat.sectionName} ${seat.seatName}` },
        unit_amount: Math.max(1, Math.round(seat.unitPrice * 100 * paymentRatio)),
      },
      quantity: 1,
    }));
    const stripeSession = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: booking.buyerEmail,
        client_reference_id: booking._id.toString(),
        metadata: {
          bookingId: booking._id.toString(),
          eventId: String(eventId),
          organizationId: String(organizationId),
          purchaseMode: "seatmap",
          useWallet: useWallet ? "true" : "false",
          walletDeduction: String(walletAmount),
          refCode: cleanRefCode || "",
          couponCode: discountRes.couponCode || "",
        },
        line_items: stripeItems,
        success_url: `${FRONTEND_URL}/o/${orgSlug}/bookings/${booking._id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/o/${orgSlug}/events/${eventId}`,
      },
      { idempotencyKey: `seatmap-${booking._id}` },
    );
    booking.stripeSessionId = stripeSession.id;
    await booking.save({ session: dbSession });
    await dbSession.commitTransaction();
    return { bookingId: booking._id, stripeSessionId: stripeSession.id, stripeUrl: stripeSession.url };
  } catch (error) {
    await dbSession.abortTransaction();
    throw error;
  } finally {
    dbSession.endSession();
  }
};

/**
 * Create a pending booking and generate a Stripe Checkout Session.
 */
const createCheckoutSession = async (eventId, organizationId, orgSlug, data) => {
  if (Array.isArray(data.items) && data.items.some((item) => item.blockId && item.seatId)) {
    return createSeatmapCheckout(eventId, organizationId, orgSlug, data);
  }
  const { buyerName, buyerEmail, items, cartKey, useWallet, walletDeduction, refCode, rewardsToApply, userId } = data;

  if (!buyerName || !buyerEmail) {
    const error = new Error("buyerName and buyerEmail are required");
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = buyerEmail.trim().toLowerCase();
  const cleanRefCode = refCode ? String(refCode).trim() : null;
  const requestedRewardsCount = rewardsToApply ? parseInt(rewardsToApply, 10) : 0;
  console.log(`[Checkout] refCode received: ${cleanRefCode || "none"} | rewardsToApply: ${requestedRewardsCount} | userId: ${userId || "none"}`);


  // Idempotency check
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

      if (
        existingSession.status === "open" ||
        existingSession.status === "requires_payment"
      ) {
        return {
          bookingId: existingPendingBooking._id,
          stripeSessionId: existingSession.id,
          stripeUrl: existingSession.url,
        };
      }

      if (existingSession.status === "expired") {
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
            refCode: cleanRefCode || "",
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
      console.error(
        `[Idempotency] Stripe lookup failed for session ${existingPendingBooking.stripeSessionId}:`,
        stripeError.message,
      );
    }
  }

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

    // Calculate coupon & referral discounts
    const discountRes = await calculateDiscounts(organizationId, eventId, totalAmount, {
      couponCode,
      rewardsToApply,
      userId,
    });

    const totalDiscount = discountRes.couponDiscountAmount + discountRes.referralDiscountAmount;
    const walletAmount = useWallet && walletDeduction > 0 ? Math.min(walletDeduction, Math.max(0, totalAmount - totalDiscount)) : 0;
    const finalAmount = Math.max(0, totalAmount - walletAmount - totalDiscount);

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
          totalAmount: finalAmount,
          originalAmount: totalAmount,
          walletDeduction: walletAmount,
          referredByCode: cleanRefCode,
          referralRewardsUsedCount: discountRes.referralRewardsUsedCount,
          discountAmount: discountRes.referralDiscountAmount,
          couponCode: discountRes.couponCode,
          couponDiscountAmount: discountRes.couponDiscountAmount,
          currency: "PKR",
          status: "pending",
          paymentStatus: "pending",
          confirmationCode,
          expiresAt: new Date(Date.now() + HOLD_DURATION_MS),
        },
      ],
      { session: mongoSession },
    );

    if (walletAmount > 0) {
      booking.walletDeductionPending = walletAmount;
      await booking.save({ session: mongoSession });
    }

     let adjustedStripeLineItems = stripeLineItems;
    const totalDeductions = walletAmount + totalDiscount;
    if (totalDeductions > 0 && totalDeductions < totalAmount) {
      const ratio = (totalAmount - totalDeductions) / totalAmount;
      adjustedStripeLineItems = stripeLineItems.map((item) => ({
        ...item,
        quantity: item.quantity,
        price_data: {
          ...item.price_data,
          unit_amount: Math.max(1, Math.round(item.price_data.unit_amount * ratio)),
        },
      }));
    } else if (totalDeductions >= totalAmount) {
      adjustedStripeLineItems = [
        {
          price_data: {
            currency: "pkr",
            product_data: {
              name: `Discounted Payment - ${event.name}`,
            },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ];
    }

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
          refCode: cleanRefCode || "",
          couponCode: discountRes.couponCode || "",
        },
        line_items: adjustedStripeLineItems,
        success_url: `${FRONTEND_URL}/o/${orgSlug}/bookings/${booking._id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/o/${orgSlug}/cart/${eventId}`,
      },
      { idempotencyKey },
    );

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
 */
const confirmBooking = async (stripeSessionId) => {
  const booking = await Booking.findOne({ stripeSessionId });

  if (!booking) {
    const error = new Error("Booking not found for this session");
    error.statusCode = 404;
    throw error;
  }

  if (booking.status === "confirmed" && booking.paymentStatus === "paid") {
    return booking;
  }

  if (booking.status === "expired") {
    const error = new Error(
      "This booking has expired and its tickets were released. Please start a new checkout.",
    );
    error.statusCode = 410;
    throw error;
  }

  const session = await stripe.checkout.sessions.retrieve(stripeSessionId);

  if (session.payment_status !== "paid") {
    const error = new Error("Payment has not been completed yet");
    error.statusCode = 400;
    throw error;
  }

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

  // Deduct wallet balance if pending
  if (booking.walletDeductionPending > 0) {
    try {
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
    }
  }

  // Process referral reward for the referrer if referredByCode was used
  try {
    await referralService.processBookingReferral(booking);
  } catch (refErr) {
    console.error("Referral reward processing failed:", refErr.message);
  }

  // Consume used referral rewards if buyer applied rewards at checkout
  if (booking.referralRewardsUsedCount > 0) {
    try {
      const user = await User.findOne({ email: booking.buyerEmail });
      if (user) {
        await referralService.consumeReferralRewards(user._id, booking.referralRewardsUsedCount, booking._id);
      }
    } catch (consumeErr) {
      console.error("Consuming referral rewards failed:", consumeErr.message);
    }
  }

  // Increment coupon usage count if coupon was used
  if (booking.couponCode) {
    try {
      await couponService.incrementCouponUses(booking.organizationId, booking.couponCode);
    } catch (couponErr) {
      console.error("Incrementing coupon uses failed:", couponErr.message);
    }
  }

  // Send confirmation email in background
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

const expireBookingIfStillPending = async (booking) => {
  if (booking.status !== "pending") {
    return;
  }
  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();
    const freshBooking = await Booking.findOne({
      _id: booking._id,
      status: "pending",
    }).session(dbSession);

    if (!freshBooking) {
      await dbSession.abortTransaction();
      return;
    }

    const event = await Event.findOne({
      _id: freshBooking.eventId,
      organizationId: freshBooking.organizationId,
    }).session(dbSession);

    if (event) {
      if (freshBooking.selectedSeats?.length) {
        for (const reference of freshBooking.selectedSeats) {
          const seat = event.selectedSeatMap?.blocks?.find((b) => b.id === reference.blockId)?.seats?.find((s) => s.id === reference.seatId);
          if (seat?.status === "checkout-held") seat.status = "available";
        }
        event.markModified("selectedSeatMap");
      } else {
        for (const item of freshBooking.items) {
          const ticketType = event.ticketTypes[item.ticketTypeIndex];
          if (ticketType) {
            const currentBooked = Number(ticketType.quantityBooked || 0);
            ticketType.quantityBooked = Math.max(0, currentBooked - item.quantity);
          }
        }
        event.markModified("ticketTypes");
      }
      await event.save({ session: dbSession });
    }

    freshBooking.status = "expired";
    await freshBooking.save({ session: dbSession });
    await dbSession.commitTransaction();
  } catch (err) {
    await dbSession.abortTransaction();
    console.error(`[Webhook] Error expiring booking ${booking._id}:`, err.message);
  } finally {
    dbSession.endSession();
  }
};

const getBooking = async (bookingId, organizationId) => {
  const booking = await Booking.findOne({ _id: bookingId, organizationId }).populate("eventId", "name dateTime bannerImageUrl venueId");
  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }
  return booking;
};

const getEventBookings = async (eventId, organizationId) => {
  return Booking.find({ eventId, organizationId }).sort({ createdAt: -1 });
};

const handleStripeWebhook = async (event) => {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    return confirmBooking(session.id);
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;
    const booking = await Booking.findOne({ stripeSessionId: session.id });
    if (booking) {
      return expireBookingIfStillPending(booking);
    }
  }
};

module.exports = {
  createCheckoutSession,
  confirmBooking,
  expireBookingIfStillPending,
  getBooking,
  getEventBookings,
  handleStripeWebhook,
};
