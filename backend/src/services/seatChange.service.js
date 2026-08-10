const SeatChangeRequest = require("../models/SeatChangeRequest");
const Booking = require("../models/Booking");
const Event = require("../models/Event");
const User = require("../models/User");
const walletService = require("./wallet.service");
const stripe = require("../config/stripe");

const createRequest = async (userId, organizationId, data, options) => {
  const { bookingId, oldSeatId, newSeat, reason, paymentMethod, newSessionId } = data;
  const { orgSlug, protocol, host } = options;

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  // 1. Verify booking ownership and state
  const booking = await Booking.findOne({ _id: bookingId, organizationId });
  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  const userEmail = user.email.toLowerCase();
  const isOwner = (booking.userId && String(booking.userId) === String(userId)) ||
                  (booking.buyerEmail && booking.buyerEmail.toLowerCase() === userEmail);

  if (!isOwner) {
    const error = new Error("You do not own this booking");
    error.statusCode = 403;
    throw error;
  }

  if (booking.status !== "confirmed") {
    const error = new Error("Only confirmed bookings can have their seat changed");
    error.statusCode = 400;
    throw error;
  }

  // 2. Find the old seat inside booking
  const oldSeat = booking.selectedSeats.find(
    (s) => s.seatId === oldSeatId || `${s.blockId}-${s.seatId}` === oldSeatId
  );
  if (!oldSeat) {
    const error = new Error("Original seat not found in this booking");
    error.statusCode = 404;
    throw error;
  }

  // 3. Verify target event & new seat availability
  const event = await Event.findOne({ _id: booking.eventId, organizationId });
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  let targetSeatMap = event.selectedSeatMap;
  let targetSessionDoc = null;
  if (event.sessions && event.sessions.length > 0) {
    targetSessionDoc = event.sessions.find(s => String(s._id) === String(newSessionId)) ||
                       event.sessions.find(s => new Date(s.dateTime) >= new Date()) ||
                       event.sessions[0];
    if (targetSessionDoc) {
      targetSeatMap = targetSessionDoc.selectedSeatMap;
    }
  }

  const checkDateTime = targetSessionDoc ? targetSessionDoc.dateTime : event.dateTime;
  if (checkDateTime && new Date(checkDateTime) < new Date()) {
    const error = new Error("Cannot change seats for an event session that has already occurred or started");
    error.statusCode = 400;
    throw error;
  }

  if (!targetSeatMap) {
    const error = new Error("Target seat map not configured");
    error.statusCode = 404;
    throw error;
  }

  const block = targetSeatMap.blocks?.find((b) => b.id === newSeat.blockId);
  const seat = block?.seats?.find((s) => s.id === newSeat.seatId);
  if (!block || !seat) {
    const error = new Error("Target seat not found in event seatmap");
    error.statusCode = 404;
    throw error;
  }
  if (seat.status !== "available") {
    const error = new Error("Target seat is no longer available");
    error.statusCode = 409;
    throw error;
  }

  // 4. Compute price difference
  const oldSeatPrice = oldSeat.unitPrice;
  const newSeatPrice = newSeat.unitPrice;
  let priceDifference = newSeatPrice - oldSeatPrice;

  // Override priceDifference to 0 if the booking is part of an event bundle
  if (booking.isBundleBooking || booking.bundleBookingId) {
    priceDifference = 0;
  }

  // 5. Create request
  const request = await SeatChangeRequest.create({
    userId,
    organizationId,
    bookingId,
    eventId: booking.eventId,
    newSessionId: targetSessionDoc ? targetSessionDoc._id : null,
    oldSeat: {
      blockId: oldSeat.blockId,
      seatId: oldSeat.seatId,
      seatName: oldSeat.seatName,
      sectionName: oldSeat.sectionName,
      unitPrice: oldSeatPrice,
    },
    newSeat: {
      blockId: newSeat.blockId,
      seatId: newSeat.seatId,
      seatName: newSeat.seatName,
      sectionName: block.name,
      unitPrice: newSeatPrice,
    },
    reason: reason ? String(reason).trim() : null,
    priceDifference,
    paymentStatus: priceDifference <= 0 ? "paid" : "pending",
    status: "pending",
  });

  // 6. Handle Payment state
  if (priceDifference <= 0) {
    request.paymentStatus = "n/a";
    // Hold new seat on map
    seat.status = "transfer-held";
    event.markModified("selectedSeatMap");
    await event.save();
    await request.save();
    return { request };
  } else {
    request.paymentStatus = "pending";
    if (paymentMethod === "wallet") {
      // Direct wallet debit
      await walletService.debit(userId, priceDifference, `Upgrade seat change fee (Booking: ${booking._id})`, {
        bookingId,
      });
      request.paymentStatus = "paid";
      // Hold new seat on map
      seat.status = "transfer-held";
      event.markModified("selectedSeatMap");
      await event.save();
      await request.save();
      return { request };
    } else {
      // Stripe checkout session
      await request.save();

      const stripeSession = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Seat Change Upgrade: ${oldSeat.seatName} -> ${newSeat.seatName}`,
                description: `Upgrade fee for event seat change request`,
              },
              unit_amount: Math.round(priceDifference * 100),
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${orgSlug}/bookings/${bookingId}/confirmation?seat_change_success=1`,
        cancel_url: `${process.env.FRONTEND_URL || "http://localhost:5173"}/o/${orgSlug}/bookings/${bookingId}/confirmation?seat_change_cancel=1`,
        metadata: {
          seatChangeRequestId: request._id.toString(),
        },
      });

      request.stripeSessionId = stripeSession.id;
      await request.save();
      return { request, checkoutUrl: stripeSession.url };
    }
  }
};

const getMyRequests = async (userId, organizationId) => {
  return SeatChangeRequest.find({ userId, organizationId }).sort({ createdAt: -1 });
};

const getMyRequestsGlobal = async (userId) => {
  return SeatChangeRequest.find({ userId })
    .populate("bookingId")
    .populate("eventId", "name dateTime bannerImageUrl")
    .sort({ createdAt: -1 });
};

const getPendingRequests = async (organizationId) => {
  return SeatChangeRequest.find({ organizationId, status: "pending" })
    .populate("bookingId")
    .sort({ createdAt: -1 });
};

const approveRequest = async (requestId, organizationId) => {
  const request = await SeatChangeRequest.findOne({ _id: requestId, organizationId, status: "pending" });
  if (!request) {
    const error = new Error("Pending seat change request not found");
    error.statusCode = 404;
    throw error;
  }
  if (request.priceDifference > 0 && request.paymentStatus !== "paid") {
    const error = new Error("Cannot approve request. Upgrade fee payment is pending.");
    error.statusCode = 400;
    throw error;
  }

  const booking = await Booking.findOne({ _id: request.bookingId, organizationId });
  if (!booking) {
    const error = new Error("Booking not found");
    error.statusCode = 404;
    throw error;
  }

  // 1. Release old seat on the original event
  const event = await Event.findOne({ _id: request.eventId, organizationId });
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  let sourceSeatMap = event.selectedSeatMap;
  let sourceSessionDoc = null;
  if (booking.sessionId && event.sessions && event.sessions.length > 0) {
    sourceSessionDoc = event.sessions.find(s => String(s._id) === String(booking.sessionId));
    if (sourceSessionDoc) {
      sourceSeatMap = sourceSessionDoc.selectedSeatMap;
    }
  }

  if (sourceSeatMap) {
    const oldBlock = sourceSeatMap.blocks?.find((b) => b.id === request.oldSeat.blockId);
    const oldSeat = oldBlock?.seats?.find((s) => s.id === request.oldSeat.seatId);
    if (oldSeat) {
      oldSeat.status = "available";
    }
  }

  // Mark new seat as sold on target event
  let targetSeatMap = event.selectedSeatMap;
  let targetSessionDoc = null;
  if (request.newSessionId && event.sessions && event.sessions.length > 0) {
    targetSessionDoc = event.sessions.find(s => String(s._id) === String(request.newSessionId));
    if (targetSessionDoc) {
      targetSeatMap = targetSessionDoc.selectedSeatMap;
    }
  }

  if (!targetSeatMap) {
    const error = new Error("Target seat map not configured");
    error.statusCode = 404;
    throw error;
  }

  const newBlock = targetSeatMap.blocks?.find((b) => b.id === request.newSeat.blockId);
  const newSeat = newBlock?.seats?.find((s) => s.id === request.newSeat.seatId);
  if (!newSeat) {
    const error = new Error("Target seat not found in event map");
    error.statusCode = 404;
    throw error;
  }
  newSeat.status = "sold";

  if (sourceSessionDoc) {
    sourceSessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(sourceSeatMap));
  } else if (!event.sessions || event.sessions.length === 0) {
    event.selectedSeatMap = JSON.parse(JSON.stringify(sourceSeatMap));
  }

  if (targetSessionDoc) {
    targetSessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
  } else if (!event.sessions || event.sessions.length === 0) {
    event.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
  }

  if (event.sessions && event.sessions.length > 0) {
    event.markModified("sessions");
  } else {
    event.markModified("selectedSeatMap");
  }
  await event.save();

  // 2. Update Booking selected seats
  if (request.newSessionId) {
    booking.sessionId = request.newSessionId;
    booking.eventDateTime = targetSessionDoc ? targetSessionDoc.dateTime : event.dateTime;
  }

  booking.selectedSeats = booking.selectedSeats.map((seat) => {
    if (seat.seatId === request.oldSeat.seatId && seat.blockId === request.oldSeat.blockId) {
      return {
        blockId: request.newSeat.blockId,
        seatId: request.newSeat.seatId,
        seatName: request.newSeat.seatName,
        sectionName: request.newSeat.sectionName,
        category: seat.category,
        unitPrice: request.newSeat.unitPrice,
      };
    }
    return seat;
  });

  // Also update booking items array to show the new seat details!
  booking.items = booking.items.map((item) => {
    const oldSeatString = `${request.oldSeat.sectionName || "General"} — ${request.oldSeat.seatName}`;
    const oldSeatStringAlt = `${request.oldSeat.sectionName || "General"} - ${request.oldSeat.seatName}`;
    if (item.ticketTypeName === oldSeatString || item.ticketTypeName === oldSeatStringAlt || item.ticketTypeName.includes(request.oldSeat.seatName)) {
      return {
        ...item,
        ticketTypeName: `${request.newSeat.sectionName || "General"} — ${request.newSeat.seatName}`,
        unitPrice: request.newSeat.unitPrice,
      };
    }
    return item;
  });

  // Regenerate QR Code
  const QRCode = require("qrcode");
  const qrData = JSON.stringify({
    bookingId: booking._id.toString(),
    confirmationCode: booking.confirmationCode,
    eventId: booking.eventId.toString(),
    buyerEmail: booking.buyerEmail,
  });
  try {
    booking.qrCodeUrl = await QRCode.toDataURL(qrData);
  } catch (qrError) {
    console.error("QR Code regeneration failed:", qrError.message);
  }

  // Update booking totalAmount to reflect the price difference (upgrade fee / cheaper refund)
  booking.totalAmount += request.priceDifference;

  await booking.save();

  // 3. Refund if cheaper (priceDifference < 0)
  if (request.priceDifference < 0) {
    const refundAmount = Math.abs(request.priceDifference);
    await walletService.credit(request.userId, refundAmount, `Refund for cheaper seat change (Booking: ${booking._id})`, {
      bookingId: booking._id,
      type: "refund",
    });
  }

  // 4. Update request status
  request.status = "approved";
  await request.save();

  return request;
};

const rejectRequest = async (requestId, organizationId) => {
  const request = await SeatChangeRequest.findOne({ _id: requestId, organizationId, status: "pending" });
  if (!request) {
    const error = new Error("Pending seat change request not found");
    error.statusCode = 404;
    throw error;
  }

  // 1. Release target seat if it was held
  if (request.paymentStatus === "paid" || request.priceDifference <= 0) {
    const event = await Event.findOne({ _id: request.eventId, organizationId });
    if (event) {
      let targetSeatMap = event.selectedSeatMap;
      let sessionDoc = null;
      if (request.newSessionId && event.sessions && event.sessions.length > 0) {
        sessionDoc = event.sessions.find(s => String(s._id) === String(request.newSessionId));
        if (sessionDoc) {
          targetSeatMap = sessionDoc.selectedSeatMap;
        }
      }
      if (targetSeatMap) {
        const block = targetSeatMap.blocks?.find((b) => b.id === request.newSeat.blockId);
        const seat = block?.seats?.find((s) => s.id === request.newSeat.seatId);
        if (seat && seat.status === "transfer-held") {
          seat.status = "available";
          if (sessionDoc) {
            event.markModified("sessions");
          } else {
            event.markModified("selectedSeatMap");
          }
          await event.save();
        }
      }
    }
  }

  // 2. Refund upfront positive difference
  if (request.priceDifference > 0 && request.paymentStatus === "paid") {
    await walletService.credit(request.userId, request.priceDifference, `Refund for rejected seat change upgrade (Request: ${request._id})`, {
      bookingId: request.bookingId,
      type: "refund",
    });
    request.paymentStatus = "refunded";
  }

  request.status = "rejected";
  await request.save();

  return request;
};

const devSimulatePay = async (requestId, organizationId) => {
  const request = await SeatChangeRequest.findOne({ _id: requestId, organizationId, status: "pending" });
  if (!request) {
    const error = new Error("Pending seat change request not found");
    error.statusCode = 404;
    throw error;
  }
  if (request.paymentStatus !== "pending") {
    const error = new Error("Request payment is not pending");
    error.statusCode = 400;
    throw error;
  }

  const event = await Event.findOne({ _id: request.eventId, organizationId });
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  let targetSeatMap = event.selectedSeatMap;
  let sessionDoc = null;
  if (request.newSessionId && event.sessions && event.sessions.length > 0) {
    sessionDoc = event.sessions.find(s => String(s._id) === String(request.newSessionId));
    if (sessionDoc) {
      targetSeatMap = sessionDoc.selectedSeatMap;
    }
  }

  if (!targetSeatMap) {
    const error = new Error("Target seat map not configured");
    error.statusCode = 404;
    throw error;
  }

  const block = targetSeatMap.blocks?.find((b) => b.id === request.newSeat.blockId);
  const seat = block?.seats?.find((s) => s.id === request.newSeat.seatId);
  if (!block || !seat) {
    const error = new Error("Target seat not found in event seatmap");
    error.statusCode = 404;
    throw error;
  }
  if (seat.status !== "available") {
    const error = new Error("Target seat is no longer available");
    error.statusCode = 409;
    throw error;
  }

  seat.status = "transfer-held";
  if (sessionDoc) {
    event.markModified("sessions");
  } else {
    event.markModified("selectedSeatMap");
  }
  await event.save();

  request.paymentStatus = "paid";
  await request.save();

  return request;
};

module.exports = {
  createRequest,
  getMyRequests,
  getMyRequestsGlobal,
  getPendingRequests,
  approveRequest,
  rejectRequest,
  devSimulatePay,
};
