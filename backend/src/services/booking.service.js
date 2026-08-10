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
  const { buyerName, buyerEmail, items, useWallet, walletDeduction, refCode, couponCode, rewardsToApply, userId, sessionId } = data;
  if (!buyerName || !buyerEmail || !Array.isArray(items) || !items.length) {
    const error = new Error("buyerName, buyerEmail and selected seats are required");
    error.statusCode = 400;
    throw error;
  }
  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();
    const event = await Event.findOne({ _id: eventId, organizationId, purchaseMode: "seatmap" }).session(dbSession);
    if (!event) {
      const error = new Error("Event not found");
      error.statusCode = 404;
      throw error;
    }

    let targetSeatMap = event.selectedSeatMap;
    let sessionDoc = null;
    if (event.sessions && event.sessions.length > 0) {
      sessionDoc = event.sessions.find(s => String(s._id) === String(sessionId)) ||
                   event.sessions.find(s => new Date(s.dateTime) >= new Date()) ||
                   event.sessions[0];
      if (sessionDoc) {
        targetSeatMap = sessionDoc.selectedSeatMap;
      }
    }

    if (!targetSeatMap) {
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
      const block = targetSeatMap.blocks?.find((item) => item.id === request.blockId);
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
          sessionId: sessionDoc ? sessionDoc._id : null,
          eventName: event.name,
          eventDateTime: sessionDoc ? sessionDoc.dateTime : event.dateTime,
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
          userId: userId || null,
          currency: "USD",
          status: "pending",
          paymentStatus: "pending",
          confirmationCode: generateConfirmationCode(),
          expiresAt: new Date(Date.now() + HOLD_DURATION_MS),
        },
      ],
      { session: dbSession },
    );
    if (sessionDoc) {
      sessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
      event.markModified("sessions");
    } else {
      event.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
      event.markModified("selectedSeatMap");
    }
    await event.save({ session: dbSession });

    if (finalAmount === 0) {
      booking.status = "confirmed";
      booking.paymentStatus = "paid";

      const qrData = JSON.stringify({
        bookingId: booking._id.toString(),
        confirmationCode: booking.confirmationCode,
        eventId: booking.eventId.toString(),
        buyerEmail: booking.buyerEmail,
      });
      try {
        booking.qrCodeUrl = await QRCode.toDataURL(qrData);
      } catch (qrError) {
        console.error("QR Code generation failed:", qrError.message);
      }

      if (booking.selectedSeats?.length) {
        for (const reference of booking.selectedSeats) {
          const seat = targetSeatMap?.blocks?.find((block) => block.id === reference.blockId)?.seats?.find((item) => item.id === reference.seatId);
          if (seat) {
            seat.status = "sold";
          }
        }
        if (sessionDoc) {
          event.markModified("sessions");
        } else {
          event.markModified("selectedSeatMap");
        }
        await event.save({ session: dbSession });
      }

      if (walletAmount > 0) {
        const targetUserId = userId || (await User.findOne({ email: booking.buyerEmail }).session(dbSession))?._id;
        if (targetUserId) {
          await walletService.debit(
            targetUserId,
            walletAmount,
            `Wallet payment for ${booking.confirmationCode}`,
            { type: "purchase", bookingId: booking._id, session: dbSession }
          );
        }
        booking.walletDeductionPending = 0;
      }

      await booking.save({ session: dbSession });

      try {
        await referralService.processBookingReferral(booking);
      } catch (refErr) {
        console.error("Referral reward processing failed:", refErr.message);
      }

      if (booking.referralRewardsUsedCount > 0) {
        try {
          const consumerUserId = userId || (await User.findOne({ email: booking.buyerEmail }).session(dbSession))?._id;
          if (consumerUserId) {
            await referralService.consumeReferralRewards(consumerUserId, booking.referralRewardsUsedCount, booking._id);
          }
        } catch (refErr) {
          console.error("Referral rewards consumption failed:", refErr.message);
        }
      }

      await dbSession.commitTransaction();
      return {
        bookingId: booking._id,
        success: true,
        confirmationUrl: `${FRONTEND_URL}/o/${orgSlug}/bookings/${booking._id}/confirmation`,
      };
    }

    const paymentRatio = totalAmount ? finalAmount / totalAmount : 1;
    const stripeItems = selectedSeats.map((seat) => ({
      price_data: {
        currency: "usd",
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
              currency: "usd",
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
          currency: "usd",
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
          userId: userId || null,
          currency: "USD",
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
            currency: "usd",
            product_data: {
              name: `Discounted Payment - ${event.name}`,
            },
            unit_amount: 100,
          },
          quantity: 1,
        },
      ];
    }

    if (finalAmount === 0) {
      booking.status = "confirmed";
      booking.paymentStatus = "paid";

      const qrData = JSON.stringify({
        bookingId: booking._id.toString(),
        confirmationCode: booking.confirmationCode,
        eventId: booking.eventId.toString(),
        buyerEmail: booking.buyerEmail,
      });
      try {
        booking.qrCodeUrl = await QRCode.toDataURL(qrData);
      } catch (qrError) {
        console.error("QR Code generation failed:", qrError.message);
      }

      if (walletAmount > 0) {
        const targetUserId = userId || (await User.findOne({ email: booking.buyerEmail }).session(mongoSession))?._id;
        if (targetUserId) {
          await walletService.debit(
            targetUserId,
            walletAmount,
            `Wallet payment for ${booking.confirmationCode}`,
            { type: "purchase", bookingId: booking._id, session: mongoSession }
          );
        }
        booking.walletDeductionPending = 0;
      }

      await booking.save({ session: mongoSession });

      try {
        await referralService.processBookingReferral(booking);
      } catch (refErr) {
        console.error("Referral reward processing failed:", refErr.message);
      }

      if (booking.referralRewardsUsedCount > 0) {
        try {
          const consumerUserId = userId || (await User.findOne({ email: booking.buyerEmail }).session(mongoSession))?._id;
          if (consumerUserId) {
            await referralService.consumeReferralRewards(consumerUserId, booking.referralRewardsUsedCount, booking._id);
          }
        } catch (refErr) {
          console.error("Referral rewards consumption failed:", refErr.message);
        }
      }

      await mongoSession.commitTransaction();
      return {
        bookingId: booking._id,
        success: true,
        confirmationUrl: `${FRONTEND_URL}/o/${orgSlug}/bookings/${booking._id}/confirmation`,
      };
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
  const bookings = await Booking.find({ stripeSessionId });

  if (!bookings || bookings.length === 0) {
    const error = new Error("Booking not found for this session");
    error.statusCode = 404;
    throw error;
  }

  const confirmedBookings = [];

  for (const booking of bookings) {
    if (booking.status === "confirmed" && booking.paymentStatus === "paid") {
      console.log(`[ConfirmBooking] Booking ${booking._id} is already confirmed.`);
      confirmedBookings.push(booking);
      continue;
    }

    if (booking.status === "expired") {
      continue;
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
      if (seatEvent) {
        let targetSeatMap = seatEvent.selectedSeatMap;
        let sessionDoc = null;
        if (booking.sessionId && seatEvent.sessions && seatEvent.sessions.length > 0) {
          sessionDoc = seatEvent.sessions.find(s => String(s._id) === String(booking.sessionId));
          if (sessionDoc) {
            targetSeatMap = sessionDoc.selectedSeatMap;
          }
        }
        for (const reference of booking.selectedSeats) {
          const seat = targetSeatMap?.blocks?.find((block) => block.id === reference.blockId)?.seats?.find((item) => item.id === reference.seatId);
          if (seat?.status === "checkout-held") seat.status = "sold";
        }
        if (sessionDoc) {
          sessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
          seatEvent.markModified("sessions");
        } else {
          seatEvent.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
          seatEvent.markModified("selectedSeatMap");
        }
        await seatEvent.save();
      }
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
        const consumerUserId = booking.userId;
        if (consumerUserId) {
          await referralService.consumeReferralRewards(consumerUserId, booking.referralRewardsUsedCount, booking._id);
        } else {
          const user = await User.findOne({ email: booking.buyerEmail });
          if (user) {
            await referralService.consumeReferralRewards(user._id, booking.referralRewardsUsedCount, booking._id);
          }
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

    confirmedBookings.push(booking);
  }

  // Return the first booking to satisfy controller redirect / page title info
  return confirmedBookings[0];
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
        let targetSeatMap = event.selectedSeatMap;
        let sessionDoc = null;
        if (freshBooking.sessionId && event.sessions && event.sessions.length > 0) {
          sessionDoc = event.sessions.find(s => String(s._id) === String(freshBooking.sessionId));
          if (sessionDoc) {
            targetSeatMap = sessionDoc.selectedSeatMap;
          }
        }
        for (const reference of freshBooking.selectedSeats) {
          const seat = targetSeatMap?.blocks?.find((b) => b.id === reference.blockId)?.seats?.find((s) => s.id === reference.seatId);
          if (seat?.status === "checkout-held") seat.status = "available";
        }
        if (sessionDoc) {
          sessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
          event.markModified("sessions");
        } else {
          event.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
          event.markModified("selectedSeatMap");
        }
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

const lookupBooking = async (identifier, organizationId) => {
  const cleanIdentifier = String(identifier || "").trim();
  if (!cleanIdentifier) {
    const error = new Error("Confirmation code or booking ID is required");
    error.statusCode = 400;
    throw error;
  }

  const identifierFilter = [{ confirmationCode: cleanIdentifier.toUpperCase() }];
  if (mongoose.Types.ObjectId.isValid(cleanIdentifier)) identifierFilter.push({ _id: cleanIdentifier });

  const booking = await Booking.findOne({
    organizationId,
    $or: identifierFilter,
  }).populate({
    path: "eventId",
    select: "name dateTime timezone bannerImageUrl venueId",
    populate: { path: "venueId", select: "name address city" },
  });

  if (!booking) {
    const error = new Error("No booking found for this organization");
    error.statusCode = 404;
    throw error;
  }
  return booking;
};

const getEventBookings = async (eventId, organizationId) => {
  return Booking.find({ eventId, organizationId }).sort({ createdAt: -1 });
};

const getBundleBookings = async (bundleBookingId, organizationId) => {
  return Booking.find({ bundleBookingId, organizationId }).populate("eventId", "name dateTime bannerImageUrl venueId");
};

const handleStripeWebhook = async (event) => {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Check if session belongs to a seat change request
    const SeatChangeRequest = require("../models/SeatChangeRequest");
    const seatRequest = await SeatChangeRequest.findOne({ stripeSessionId: session.id });
    if (seatRequest) {
      seatRequest.paymentStatus = "paid";
      await seatRequest.save();

      // Hold new seat on the event seatmap
      const Event = require("../models/Event");
      const eventDoc = await Event.findById(seatRequest.eventId);
      let targetSeatMap = eventDoc.selectedSeatMap;
      let sessionDoc = null;
      if (seatRequest.newSessionId && eventDoc.sessions && eventDoc.sessions.length > 0) {
        sessionDoc = eventDoc.sessions.find(s => String(s._id) === String(seatRequest.newSessionId));
        if (sessionDoc) {
          targetSeatMap = sessionDoc.selectedSeatMap;
        }
      }
      if (eventDoc && targetSeatMap) {
        const block = targetSeatMap.blocks?.find((b) => b.id === seatRequest.newSeat.blockId);
        const seat = block?.seats?.find((s) => s.id === seatRequest.newSeat.seatId);
        if (seat) {
          seat.status = "transfer-held";
          if (sessionDoc) {
            sessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
            eventDoc.markModified("sessions");
          } else {
            eventDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
            eventDoc.markModified("selectedSeatMap");
          }
          await eventDoc.save();
        }
      }
      return;
    }

    return confirmBooking(session.id);
  }
  if (event.type === "checkout.session.expired") {
    const session = event.data.object;

    const SeatChangeRequest = require("../models/SeatChangeRequest");
    const seatRequest = await SeatChangeRequest.findOne({ stripeSessionId: session.id });
    if (seatRequest) {
      seatRequest.paymentStatus = "failed";
      await seatRequest.save();
      return;
    }

    const booking = await Booking.findOne({ stripeSessionId: session.id });
    if (booking) {
      return expireBookingIfStillPending(booking);
    }
  }
};

const verifyTicket = async (bookingId, organizationId) => {
  const booking = await Booking.findOne({ _id: bookingId, organizationId });
  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }
  if (booking.status !== "confirmed") {
    const error = new Error("Only confirmed bookings can be verified");
    error.statusCode = 400;
    throw error;
  }
  if (booking.verified) {
    const timeStr = booking.verifiedAt ? new Date(booking.verifiedAt).toLocaleTimeString() : "an earlier time";
    const dateStr = booking.verifiedAt ? new Date(booking.verifiedAt).toLocaleDateString() : "";
    const error = new Error(`Ticket already verified at ${timeStr} on ${dateStr}`);
    error.statusCode = 409;
    throw error;
  }

  booking.verified = true;
  booking.verifiedAt = new Date();
  await booking.save();
  return booking;
};

const createBundleCheckout = async (bundleId, organizationId, orgSlug, data) => {
  const { buyerName, buyerEmail, selections, useWallet, walletDeduction, refCode, couponCode, rewardsToApply, userId, bundleAccessCode, eventAccessCodes } = data;
  const EventBundle = require("../models/EventBundle");
  const Event = require("../models/Event");

  if (!buyerName || !buyerEmail || !selections || typeof selections !== "object") {
    const error = new Error("buyerName, buyerEmail, and selections are required");
    error.statusCode = 400;
    throw error;
  }

  const bundle = await EventBundle.findOne({ _id: bundleId, organizationId });
  if (!bundle) {
    const error = new Error("Event bundle not found");
    error.statusCode = 404;
    throw error;
  }

  // 1. Check if the bundle is protected (Case 1)
  const isBundleProtected = bundle.accessCode && (!bundle.privateCodeExpiry || new Date(bundle.privateCodeExpiry) > new Date());
  if (isBundleProtected) {
    if (!bundleAccessCode || bundleAccessCode.trim() !== bundle.accessCode.trim()) {
      const error = new Error("This event bundle is protected. A valid access code is required.");
      error.statusCode = 403;
      throw error;
    }
  }

  // 2. Validate event-level access codes (Case 2 and Case 3)
  const isBundleUnlocked = isBundleProtected && bundleAccessCode && bundleAccessCode.trim() === bundle.accessCode.trim();

  // Load events to check accessCode
  const events = await Event.find({ _id: { $in: bundle.eventIds }, organizationId });
  for (const event of events) {
    const isEventProtected = event.accessCode && (!event.privateCodeExpiry || new Date(event.privateCodeExpiry) > new Date());
    if (isEventProtected) {
      // Bypassed if bundle override is active (Case 2), otherwise requires correct event code (Case 3)
      const isUnlocked = (!isBundleProtected) || isBundleUnlocked || (eventAccessCodes && eventAccessCodes[event._id.toString()] && eventAccessCodes[event._id.toString()].trim() === event.accessCode.trim());
      if (!isUnlocked) {
        const error = new Error(`The event "${event.name}" is protected. A valid access code is required.`);
        error.statusCode = 403;
        throw error;
      }
    }
  }

  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();

    const normalizedEmail = buyerEmail.trim().toLowerCase();
    const cleanRefCode = refCode ? String(refCode).trim() : null;
    const bundleBookingId = new mongoose.Types.ObjectId();
    const stripeSessionId = `sess_${crypto.randomBytes(12).toString("hex")}`; // Temporary placeholder before Stripe session

    let totalAmount = 0;
    const bookingsData = [];
    const eventsToUpdate = [];

    // ── Bundle pricing model ───────────────────────────────────────────────
    // pricePerSeat = the flat price charged for the WHOLE bundle (all events)
    // for ONE seat quantity slot. Total = pricePerSeat × qty
    // where qty = number of seats the buyer picks per event.
    // The number of events does NOT multiply the price.

    // First pass: validate selections and determine qty
    let firstSelections = null;
    let resolvedFirstEventId = null;

    for (const eventId of bundle.eventIds) {
      firstSelections = selections[eventId.toString()];
      if (firstSelections) {
        resolvedFirstEventId = eventId;
        break;
      }
    }

    if (!firstSelections || !Array.isArray(firstSelections) || firstSelections.length === 0) {
      throw new Error("Please select seats for all events in the bundle.");
    }
    const qty = firstSelections.length; // seats per event
    const numEvents = bundle.eventIds.length;

    // Total bundle charge = pricePerSeat × qty
    const bundleTotalAmount = Number(bundle.pricePerSeat) * qty;

    // Each event's proportional share of the bundle price
    const eventShare = bundleTotalAmount / numEvents;
    // Each seat's unit price within an event
    const unitPricePerSeat = eventShare / qty;

    // ── Main loop: validate seats ──────────────────────────────────────────
    const selectedSessionIds = data.selectedSessionIds || {};
    for (const eventId of bundle.eventIds) {
      const eventSelections = selections[eventId.toString()];

      const event = await Event.findOne({ _id: eventId, organizationId }).session(dbSession);
      if (!event) {
        throw new Error(`Event not found.`);
      }

      const sessionId = selectedSessionIds[eventId.toString()];
      let targetSeatMap = event.selectedSeatMap;
      let sessionDoc = null;
      if (event.sessions && event.sessions.length > 0) {
        sessionDoc = event.sessions.find(s => String(s._id) === String(sessionId)) ||
                     event.sessions.find(s => new Date(s.dateTime) >= new Date()) ||
                     event.sessions[0];
        if (sessionDoc) {
          targetSeatMap = sessionDoc.selectedSeatMap;
        }
      }

      if (!targetSeatMap) {
        throw new Error(`Seat map not configured for event ${event.name}.`);
      }

      if (!eventSelections || !Array.isArray(eventSelections) || eventSelections.length === 0) {
        throw new Error(`Please select seats for all events in the bundle.`);
      }
      if (eventSelections.length !== qty) {
        throw new Error(`You must select the same number of seats for each event in the bundle.`);
      }

      const selectedSeats = [];
      const seen = new Set();

      for (const item of eventSelections) {
        const key = `${item.blockId}:${item.seatId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const block = targetSeatMap.blocks?.find((b) => b.id === item.blockId);
        const seat = block?.seats?.find((s) => s.id === item.seatId);

        if (!block || !seat || seat.status !== "available") {
          throw new Error(`One or more selected seats for event ${event.name} are no longer available.`);
        }

        seat.status = "checkout-held";

        selectedSeats.push({
          blockId: block.id,
          seatId: seat.id,
          seatName: seat.seatName,
          sectionName: block.name,
          category: block.category || null,
          unitPrice: unitPricePerSeat,
        });
      }

      eventsToUpdate.push({ event, sessionDoc });

      bookingsData.push({
        organizationId,
        eventId: event._id,
        sessionId: sessionDoc ? sessionDoc._id : null,
        eventName: event.name,
        eventDateTime: sessionDoc ? sessionDoc.dateTime : event.dateTime,
        buyerName: buyerName.trim(),
        buyerEmail: normalizedEmail,
        items: selectedSeats.map((seat) => ({
          ticketTypeName: `${seat.sectionName} — ${seat.seatName} (Bundle)`,
          quantity: 1,
          unitPrice: seat.unitPrice,
          lineTotal: seat.unitPrice,
        })),
        selectedSeats,
        totalAmount: 0, // Will be computed after discount distribution
        originalAmount: eventShare, // this event's equal share of the bundle price
        referredByCode: cleanRefCode,
        userId: userId || null,
        currency: "USD",
        status: "pending",
        paymentStatus: "pending",
        isBundleBooking: true,
        bundleBookingId,
        expiresAt: new Date(Date.now() + HOLD_DURATION_MS),
        confirmationCode: generateConfirmationCode(),
      });
    }

    // totalAmount for discounts/wallet = full bundle price
    totalAmount = bundleTotalAmount;

    // Save event seat states
    for (const { event, sessionDoc } of eventsToUpdate) {
      if (sessionDoc) {
        sessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(sessionDoc.selectedSeatMap));
        event.markModified("sessions");
      } else {
        event.selectedSeatMap = JSON.parse(JSON.stringify(event.selectedSeatMap));
        event.markModified("selectedSeatMap");
      }
      await event.save({ session: dbSession });
    }

    // Calculate discounts based on global bundle total amount
    const discountRes = await calculateDiscounts(organizationId, bundle.eventIds[0], totalAmount, {
      couponCode,
      rewardsToApply,
      userId,
    });

    const totalDiscount = discountRes.couponDiscountAmount + discountRes.referralDiscountAmount;
    const walletAmount = useWallet && walletDeduction > 0 ? Math.min(walletDeduction, Math.max(0, totalAmount - totalDiscount)) : 0;
    const finalAmount = Math.max(0, totalAmount - walletAmount - totalDiscount);

    // Distribute total finalAmount across bookings proportionally
    const stripeLineItems = [];
    const createdBookings = [];

    for (let i = 0; i < bookingsData.length; i++) {
      const bData = bookingsData[i];
      const weight = bData.originalAmount / totalAmount;
      const proportionalDiscount = totalDiscount * weight;
      const proportionalWallet = walletAmount * weight;
      const proportionalFinal = Math.max(0, bData.originalAmount - proportionalDiscount - proportionalWallet);

      bData.totalAmount = proportionalFinal;
      bData.walletDeduction = proportionalWallet;
      bData.walletDeductionPending = proportionalWallet;
      bData.discountAmount = discountRes.referralDiscountAmount * weight;
      bData.couponCode = discountRes.couponCode;
      bData.couponDiscountAmount = discountRes.couponDiscountAmount * weight;
      bData.referralRewardsUsedCount = Math.round(discountRes.referralRewardsUsedCount * weight);

      const [newBooking] = await Booking.create([bData], { session: dbSession });
      createdBookings.push(newBooking);

      for (const seat of bData.selectedSeats) {
        stripeLineItems.push({
          price_data: {
            currency: "usd",
            product_data: { name: `Bundle: ${bData.eventName} — ${seat.sectionName} ${seat.seatName}` },
            unit_amount: Math.max(1, Math.round(seat.unitPrice * 100 * (proportionalFinal / bData.originalAmount))),
          },
          quantity: 1,
        });
      }
    }

    if (finalAmount === 0) {
      for (const booking of createdBookings) {
        booking.status = "confirmed";
        booking.paymentStatus = "paid";

        const qrData = JSON.stringify({
          bookingId: booking._id.toString(),
          confirmationCode: booking.confirmationCode,
          eventId: booking.eventId.toString(),
          buyerEmail: booking.buyerEmail,
        });
        try {
          booking.qrCodeUrl = await QRCode.toDataURL(qrData);
        } catch (qrError) {
          console.error("QR Code generation failed:", qrError.message);
        }

        if (booking.selectedSeats?.length) {
          const seatEventObj = eventsToUpdate.find((item) => item.event._id.toString() === booking.eventId.toString());
          if (seatEventObj) {
            const { event: seatEvent, sessionDoc } = seatEventObj;
            let targetSeatMap = seatEvent.selectedSeatMap;
            if (sessionDoc) {
              targetSeatMap = sessionDoc.selectedSeatMap;
            }
            for (const reference of booking.selectedSeats) {
              const seat = targetSeatMap?.blocks?.find((block) => block.id === reference.blockId)?.seats?.find((item) => item.id === reference.seatId);
              if (seat) {
                seat.status = "sold";
              }
            }
            if (sessionDoc) {
              sessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
              seatEvent.markModified("sessions");
            } else {
              seatEvent.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
              seatEvent.markModified("selectedSeatMap");
            }
            await seatEvent.save({ session: dbSession });
          }
        }

        if (booking.walletDeduction > 0) {
          const targetUserId = userId || (await User.findOne({ email: booking.buyerEmail }).session(dbSession))?._id;
          if (targetUserId) {
            await walletService.debit(
              targetUserId,
              booking.walletDeduction,
              `Wallet payment for ${booking.confirmationCode}`,
              { type: "purchase", bookingId: booking._id, session: dbSession }
            );
          }
          booking.walletDeductionPending = 0;
        }

        await booking.save({ session: dbSession });

        try {
          await referralService.processBookingReferral(booking);
        } catch (refErr) {
          console.error("Referral reward processing failed:", refErr.message);
        }

        if (booking.referralRewardsUsedCount > 0) {
          try {
            const consumerUserId = userId || (await User.findOne({ email: booking.buyerEmail }).session(dbSession))?._id;
            if (consumerUserId) {
              await referralService.consumeReferralRewards(consumerUserId, booking.referralRewardsUsedCount, booking._id);
            }
          } catch (refErr) {
            console.error("Referral rewards consumption failed:", refErr.message);
          }
        }
      }

      await dbSession.commitTransaction();
      return {
        bundleBookingId,
        success: true,
        confirmationUrl: `${FRONTEND_URL}/o/${orgSlug}/bookings/${createdBookings[0]._id}/confirmation`,
      };
    }

    // Create Stripe Session
    const stripeSession = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: normalizedEmail,
        client_reference_id: createdBookings[0]._id.toString(), // Reference first booking
        metadata: {
          bundleBookingId: bundleBookingId.toString(),
          bundleId: bundleId.toString(),
          organizationId: organizationId.toString(),
          useWallet: useWallet ? "true" : "false",
          walletDeduction: walletAmount.toString(),
          refCode: cleanRefCode || "",
          couponCode: discountRes.couponCode || "",
        },
        line_items: stripeLineItems,
        success_url: `${FRONTEND_URL}/o/${orgSlug}/bookings/${createdBookings[0]._id}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${FRONTEND_URL}/o/${orgSlug}/events/${bundle.eventIds[0]}`,
      },
      { idempotencyKey: `bundle-${bundleBookingId}` }
    );

    // Save Stripe session ID to all bookings in this bundle checkout
    for (const booking of createdBookings) {
      booking.stripeSessionId = stripeSession.id;
      await booking.save({ session: dbSession });
    }

    await dbSession.commitTransaction();

    return {
      bundleBookingId,
      stripeSessionId: stripeSession.id,
      stripeUrl: stripeSession.url,
    };
  } catch (error) {
    await dbSession.abortTransaction();
    throw error;
  } finally {
    dbSession.endSession();
  }
};

module.exports = {
  createCheckoutSession,
  confirmBooking,
  expireBookingIfStillPending,
  getBooking,
  lookupBooking,
  getEventBookings,
  getBundleBookings,
  handleStripeWebhook,
  verifyTicket,
  createBundleCheckout,
};
