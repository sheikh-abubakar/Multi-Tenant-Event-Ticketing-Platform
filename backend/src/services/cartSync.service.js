const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const Event = require("../models/Event");

const HOLD_DURATION_MS = 48 * 60 * 60 * 1000; // 48 hours (2 days)

const getOrCreateCart = async (userId, cartId) => {
  let cart = null;
  if (userId) {
    cart = await Cart.findOne({ userId });
  }
  if (!cart) {
    cart = await Cart.findOne({ cartId });
  }

  if (!cart) {
    cart = new Cart({
      userId: userId || null,
      cartId,
      items: [],
      expiresAt: new Date(Date.now() + HOLD_DURATION_MS),
    });
  } else {
    // If the cart doesn't have an expiresAt set or is empty, initialize it
    if (!cart.expiresAt || cart.items.length === 0) {
      cart.expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
    }
    // Update userId if guest logged in
    if (userId && !cart.userId) {
      cart.userId = userId;
    }
  }
  return cart;
};

const syncCart = async (userId, cartId, items) => {
  const cart = await getOrCreateCart(userId, cartId);

  // Preserve the original expiresAt if there are already items,
  // otherwise start a new 48-hour countdown.
  if (cart.items.length === 0 && items.length > 0) {
    cart.expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
  }

  cart.items = items;
  await cart.save();
  return cart;
};

const getCart = async (userId, cartId) => {
  let cart = null;
  if (userId) {
    cart = await Cart.findOne({ userId });
  }
  if (!cart) {
    cart = await Cart.findOne({ cartId });
  }
  return cart || { items: [], expiresAt: new Date(Date.now() + HOLD_DURATION_MS) };
};

const sameCartItem = (left, right) => {
  if (left.itemType === "bundle" || right.itemType === "bundle") {
    return left.itemType === right.itemType && String(left.bundleId || "") === String(right.bundleId || "");
  }
  return String(left.eventId) === String(right.eventId) &&
    String(left.eventSessionId || "") === String(right.eventSessionId || "") &&
    String(left.blockId || "") === String(right.blockId || "") &&
    String(left.seatId || "") === String(right.seatId || "") &&
    String(left.ticketTypeIndex || "") === String(right.ticketTypeIndex || "");
};

const claimGuestCart = async (userId, guestCartId) => {
  if (!guestCartId) return getCart(userId, "");

  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();
    // MongoDB does not allow concurrent operations on one transaction session.
    // Keep these reads sequential so a guest-cart claim is transaction-safe.
    const accountCart = await Cart.findOne({ userId }).session(dbSession);
    const guestCart = await Cart.findOne({ cartId: guestCartId, userId: null }).session(dbSession);

    if (!guestCart) {
      await dbSession.commitTransaction();
      return accountCart || { items: [], expiresAt: new Date(Date.now() + HOLD_DURATION_MS) };
    }

    if (!accountCart) {
      guestCart.userId = userId;
      await guestCart.save({ session: dbSession });
      await dbSession.commitTransaction();
      return guestCart;
    }

    for (const guestItem of guestCart.items) {
      if (!accountCart.items.some((accountItem) => sameCartItem(accountItem, guestItem))) {
        accountCart.items.push(guestItem.toObject ? guestItem.toObject() : guestItem);
      }
    }
    accountCart.expiresAt = new Date(Math.min(
      new Date(accountCart.expiresAt || Date.now() + HOLD_DURATION_MS).getTime(),
      new Date(guestCart.expiresAt || Date.now() + HOLD_DURATION_MS).getTime(),
    ));
    await accountCart.save({ session: dbSession });
    await Cart.deleteOne({ _id: guestCart._id }).session(dbSession);
    await dbSession.commitTransaction();
    return accountCart;
  } catch (error) {
    await dbSession.abortTransaction();
    throw error;
  } finally {
    dbSession.endSession();
  }
};

const lockSeat = async (userId, cartId, seatData) => {
  const { eventId, eventSessionId, blockId, seatId, seatName, sectionName, category, unitPrice, bundleId } = seatData;

  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();

    const event = await Event.findOne({ _id: eventId }).session(dbSession);
    if (!event) {
      throw new Error("Event not found");
    }

    let targetSeatMap = event.selectedSeatMap;
    let sessionDoc = null;
    if (event.sessions && event.sessions.length > 0) {
      sessionDoc = eventSessionId
        ? event.sessions.find((session) => String(session._id) === String(eventSessionId))
        : event.sessions.find((session) => new Date(session.dateTime) >= new Date());
      if (!sessionDoc) {
        throw new Error("No upcoming event session is available for this seat selection");
      }
      targetSeatMap = sessionDoc.selectedSeatMap;
    }
    const resolvedSessionId = sessionDoc ? String(sessionDoc._id) : null;

    if (!targetSeatMap) {
      throw new Error("Seat map not configured for this event");
    }

    const block = targetSeatMap.blocks?.find(b => b.id === blockId);
    const seat = block?.seats?.find(s => s.id === seatId);

    if (!block || !seat) {
      throw new Error("Seat not found in event seat map");
    }

    // Only allow locking if available
    if (seat.status !== "available") {
      throw new Error("Seat is already reserved or held by another buyer");
    }

    // Lock the seat in Event DB
    seat.status = "checkout-held";

    if (sessionDoc) {
      sessionDoc.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
      event.markModified("sessions");
    } else {
      event.selectedSeatMap = JSON.parse(JSON.stringify(targetSeatMap));
      event.markModified("selectedSeatMap");
    }

    await event.save({ session: dbSession });

    // Sync item to User's Cart
    const cart = await getOrCreateCart(userId, cartId);
    
    // Check if item already exists in cart to avoid duplicates
    const exists = cart.items.some(
      item => String(item.eventId) === String(eventId) && 
              String(item.eventSessionId || "") === String(resolvedSessionId || "") &&
              item.blockId === blockId && 
              item.seatId === seatId
    );

    if (!exists) {
      cart.items.push({
        eventId,
        eventSessionId: resolvedSessionId,
        blockId,
        seatId,
        seatName,
        sectionName,
        category,
        unitPrice,
        bundleId: bundleId || null,
        quantity: 1,
      });
      // Start countdown on first item
      if (cart.items.length === 1) {
        cart.expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
      }
    }

    await cart.save({ session: dbSession });
    await dbSession.commitTransaction();

    return cart;
  } catch (err) {
    await dbSession.abortTransaction();
    throw err;
  } finally {
    dbSession.endSession();
  }
};

const unlockSeat = async (userId, cartId, seatData) => {
  const { eventId, eventSessionId, blockId, seatId } = seatData;

  const dbSession = await mongoose.startSession();
  try {
    dbSession.startTransaction();

    const event = await Event.findOne({ _id: eventId }).session(dbSession);
    if (event) {
      let targetSeatMap = event.selectedSeatMap;
      let sessionDoc = null;
      if (eventSessionId && event.sessions && event.sessions.length > 0) {
        sessionDoc = event.sessions.find(s => String(s._id) === String(eventSessionId));
        if (sessionDoc) {
          targetSeatMap = sessionDoc.selectedSeatMap;
        }
      }

      if (targetSeatMap) {
        const block = targetSeatMap.blocks?.find(b => b.id === blockId);
        const seat = block?.seats?.find(s => s.id === seatId);

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
        await event.save({ session: dbSession });
      }
    }

    // Remove from user's cart in DB
    const cart = await getOrCreateCart(userId, cartId);
    cart.items = cart.items.filter(
      item => !(String(item.eventId) === String(eventId) && 
                String(item.eventSessionId) === String(eventSessionId) &&
                item.blockId === blockId && 
                item.seatId === seatId)
    );

    // If cart becomes empty, clean up the expiry
    if (cart.items.length === 0) {
      cart.expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
    }

    await cart.save({ session: dbSession });
    await dbSession.commitTransaction();

    return cart;
  } catch (err) {
    await dbSession.abortTransaction();
    throw err;
  } finally {
    dbSession.endSession();
  }
};

const clearCartItems = async (userId, cartId) => {
  const cart = await getOrCreateCart(userId, cartId);
  cart.items = [];
  cart.expiresAt = new Date(Date.now() + HOLD_DURATION_MS);
  await cart.save();
  return cart;
};

module.exports = {
  syncCart,
  getCart,
  lockSeat,
  unlockSeat,
  clearCartItems,
  claimGuestCart,
};
