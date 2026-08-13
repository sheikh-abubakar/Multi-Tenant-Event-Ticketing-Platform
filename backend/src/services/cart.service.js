const mongoose = require("mongoose");
const Event = require("../models/Event");
const Cart = require("../models/Cart");

const normalizeSessionId = (sessionId) => {
  if (!sessionId || sessionId === "undefined" || sessionId === "null") return null;
  return String(sessionId);
};

const getUnifiedCart = async (req) => {
  const userId = req.user?._id;
  const cartId = req.headers["x-cart-id"] || req.sessionID;
  
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
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
    });
  }
  return cart;
};

const formatEventCart = (cartDoc, organizationId, eventId, sessionId) => {
  const cleanSessionId = normalizeSessionId(sessionId);
  const eventItems = cartDoc.items.filter(item => 
    String(item.eventId) === String(eventId) && 
    String(item.eventSessionId || "") === String(cleanSessionId || "")
  );
  return {
    organizationId,
    eventId,
    sessionId: cleanSessionId,
    items: eventItems,
    createdAt: cartDoc.createdAt,
    updatedAt: cartDoc.updatedAt
  };
};

const getCartByEvent = async (req, organizationId, eventId, sessionId) => {
  const cleanSessionId = normalizeSessionId(sessionId);
  const event = await Event.findOne({ _id: eventId, organizationId })
    .select("name description dateTime bannerImageUrl ticketTypes purchaseMode venueId timezone selectedSeatMap sessions")
    .populate("venueId", "name city")
    .lean();

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  if (cleanSessionId && event.sessions && event.sessions.length > 0) {
    const sessionDoc = event.sessions.find(s => String(s._id) === String(cleanSessionId));
    if (sessionDoc) {
      event.dateTime = sessionDoc.dateTime;
    }
  }

  const cartDoc = await getUnifiedCart(req);
  const cart = formatEventCart(cartDoc, organizationId, eventId, cleanSessionId);

  // Reconcile seat map holds
  if (event.purchaseMode === "seatmap" && cart.items?.some((item) => item.blockId && item.seatId)) {
    const activeSession = (cleanSessionId && event.sessions?.find((item) => String(item._id) === String(cleanSessionId)))
      || event.sessions?.find((item) => new Date(item.dateTime) >= new Date())
      || event.sessions?.[0];
    const seatmap = activeSession?.selectedSeatMap || event.selectedSeatMap;
    if (seatmap?.blocks) {
      const before = cartDoc.items.length;
      cartDoc.items = cartDoc.items.filter((item) => {
        const isThisEventSession = String(item.eventId) === String(eventId) && String(item.eventSessionId || "") === String(cleanSessionId || "");
        if (!isThisEventSession) return true;
        if (!item.blockId || !item.seatId) return true;
        const seat = seatmap.blocks.find((block) => block.id === item.blockId)?.seats?.find((candidate) => candidate.id === item.seatId);
        return seat?.status === "available";
      });
      if (cartDoc.items.length !== before) {
        await cartDoc.save();
      }
    }
  }

  return {
    event,
    cart: formatEventCart(cartDoc, organizationId, eventId, cleanSessionId),
  };
};

const addItem = async (req, organizationId, eventId, data) => {
  if (data.seatId && data.blockId) return addSeat(req, organizationId, eventId, data);
  const { ticketTypeIndex, quantity } = data;

  const ticketTypeIdx = Number(ticketTypeIndex);
  const qty = Number(quantity);

  if (!Number.isInteger(ticketTypeIdx) || ticketTypeIdx < 0) {
    const error = new Error("ticketTypeIndex is required and must be valid");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(qty) || qty < 1) {
    const error = new Error("quantity must be at least 1");
    error.statusCode = 400;
    throw error;
  }

  const event = await Event.findOne({ _id: eventId, organizationId });

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const ticketType = event.ticketTypes[ticketTypeIdx];

  if (!ticketType) {
    const error = new Error("Invalid ticket type");
    error.statusCode = 400;
    throw error;
  }

  const cartDoc = await getUnifiedCart(req);
  
  const existingItem = cartDoc.items.find(
    (item) => String(item.eventId) === String(eventId) && item.ticketTypeIndex === ticketTypeIdx
  );

  const currentQuantity = existingItem ? existingItem.quantity : 0;
  const requestedQuantity = currentQuantity + qty;
  const remaining =
    Number(ticketType.quantityTotal) - Number(ticketType.quantityBooked || 0);

  if (requestedQuantity > remaining) {
    const error = new Error(`Not enough tickets left for ${ticketType.name}`);
    error.statusCode = 409;
    throw error;
  }

  if (existingItem) {
    existingItem.quantity = requestedQuantity;
  } else {
    cartDoc.items.push({
      eventId,
      eventSessionId: null,
      ticketTypeIndex: ticketTypeIdx,
      ticketTypeName: ticketType.name,
      quantity: qty,
      unitPrice: Number(ticketType.price),
    });
  }

  await cartDoc.save();

  return formatEventCart(cartDoc, organizationId, eventId);
};

const addSeat = async (req, organizationId, eventId, { blockId, seatId, overridePrice, bundleId, sessionId }) => {
  const cleanSessionId = normalizeSessionId(sessionId);
  const event = await Event.findOne({ _id: eventId, organizationId });
  if (!event) { const error = new Error("Event not found"); error.statusCode = 404; throw error; }

  let targetSeatMap = event.selectedSeatMap;
  if (event.sessions && event.sessions.length > 0) {
    const session = event.sessions.find(s => String(s._id) === String(cleanSessionId)) ||
                    event.sessions.find(s => new Date(s.dateTime) >= new Date()) ||
                    event.sessions[0];
    if (session) {
      targetSeatMap = session.selectedSeatMap;
    }
  }

  if (event.purchaseMode !== "seatmap" || !targetSeatMap) { const error = new Error("This event does not use seat selection"); error.statusCode = 400; throw error; }

  if (bundleId) {
    const EventBundle = require("../models/EventBundle");
    const bundle = await EventBundle.findOne({ _id: bundleId, organizationId });
    if (bundle && bundle.allowedSections?.length) {
      const restriction = bundle.allowedSections.find(
        (r) => r.eventId.toString() === eventId.toString()
      );
      if (restriction && restriction.blockId && restriction.blockId !== blockId) {
        const error = new Error(`Only seats in the "${restriction.blockName}" section are allowed for this bundle.`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  const block = targetSeatMap.blocks?.find((item) => item.id === blockId);
  const seat = block?.seats?.find((item) => item.id === seatId);
  if (!seat || !block) { const error = new Error("Seat not found"); error.statusCode = 404; throw error; }
  if (seat.status !== "available") { const error = new Error("This seat is no longer available"); error.statusCode = 409; throw error; }
  
  const cartDoc = await getUnifiedCart(req);
  if (!cartDoc.items.some((item) => String(item.eventId) === String(eventId) && String(item.eventSessionId || "") === String(cleanSessionId || "") && item.blockId === blockId && item.seatId === seatId)) {
    const finalPrice = overridePrice !== undefined && overridePrice !== null ? Number(overridePrice) : Number(block.price || 0);
    cartDoc.items.push({ 
      eventId,
      eventSessionId: cleanSessionId,
      blockId, 
      seatId, 
      seatName: seat.seatName, 
      sectionName: block.name, 
      category: block.category || null, 
      quantity: 1, 
      unitPrice: finalPrice,
      bundleId: bundleId || null,
    });
  }
  await cartDoc.save();
  return formatEventCart(cartDoc, organizationId, eventId, cleanSessionId);
};

const removeSeat = async (req, organizationId, eventId, blockId, seatId, sessionId) => {
  const cleanSessionId = normalizeSessionId(sessionId);
  const cartDoc = await getUnifiedCart(req);
  cartDoc.items = cartDoc.items.filter((item) => 
    !(String(item.eventId) === String(eventId) && 
      String(item.eventSessionId || "") === String(cleanSessionId || "") && 
      item.blockId === blockId && 
      item.seatId === seatId)
  );
  await cartDoc.save(); 
  return formatEventCart(cartDoc, organizationId, eventId, cleanSessionId);
};

const updateItem = async (req, organizationId, eventId, data) => {
  const { ticketTypeIndex, quantity } = data;

  const ticketTypeIdx = Number(ticketTypeIndex);
  const qty = Number(quantity);

  if (!Number.isInteger(ticketTypeIdx) || ticketTypeIdx < 0) {
    const error = new Error("ticketTypeIndex is required and must be valid");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(qty) || qty < 0) {
    const error = new Error("quantity must be 0 or greater");
    error.statusCode = 400;
    throw error;
  }

  const event = await Event.findOne({ _id: eventId, organizationId });

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const ticketType = event.ticketTypes[ticketTypeIdx];

  if (!ticketType) {
    const error = new Error("Invalid ticket type");
    error.statusCode = 400;
    throw error;
  }

  const cartDoc = await getUnifiedCart(req);
  const itemIndex = cartDoc.items.findIndex(
    (item) => String(item.eventId) === String(eventId) && item.ticketTypeIndex === ticketTypeIdx
  );

  if (qty === 0) {
    if (itemIndex !== -1) {
      cartDoc.items.splice(itemIndex, 1);
    }
    await cartDoc.save();
    return formatEventCart(cartDoc, organizationId, eventId);
  }

  const remaining =
    Number(ticketType.quantityTotal) - Number(ticketType.quantityBooked || 0);

  if (qty > remaining) {
    const error = new Error(`Not enough tickets left for ${ticketType.name}`);
    error.statusCode = 409;
    throw error;
  }

  if (itemIndex !== -1) {
    cartDoc.items[itemIndex].quantity = qty;
  } else {
    cartDoc.items.push({
      eventId,
      eventSessionId: null,
      ticketTypeIndex: ticketTypeIdx,
      ticketTypeName: ticketType.name,
      quantity: qty,
      unitPrice: Number(ticketType.price),
    });
  }

  await cartDoc.save();

  return formatEventCart(cartDoc, organizationId, eventId);
};

const removeItem = async (req, organizationId, eventId, ticketTypeIndex) => {
  const ticketTypeIdx = Number(ticketTypeIndex);

  if (!Number.isInteger(ticketTypeIdx) || ticketTypeIdx < 0) {
    const error = new Error("ticketTypeIndex is required and must be valid");
    error.statusCode = 400;
    throw error;
  }

  const cartDoc = await getUnifiedCart(req);
  cartDoc.items = cartDoc.items.filter(
    (item) => !(String(item.eventId) === String(eventId) && item.ticketTypeIndex === ticketTypeIdx)
  );
  await cartDoc.save();

  return formatEventCart(cartDoc, organizationId, eventId);
};

const clearCart = async (req, organizationId, eventId, sessionId) => {
  const cleanSessionId = normalizeSessionId(sessionId);
  const cartDoc = await getUnifiedCart(req);
  cartDoc.items = cartDoc.items.filter(
    (item) => !(String(item.eventId) === String(eventId) && String(item.eventSessionId || "") === String(cleanSessionId || ""))
  );
  await cartDoc.save();

  return {
    organizationId,
    eventId,
    sessionId: cleanSessionId,
    items: [],
  };
};

const getAllSessionCarts = async (req) => {
  const cartDoc = await getUnifiedCart(req);
  if (!cartDoc.items?.length) return [];

  const groupsMap = new Map();
  cartDoc.items.forEach((item) => {
    const key = `${item.eventId}:${item.eventSessionId || ""}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        eventId: item.eventId,
        sessionId: item.eventSessionId || null,
        items: []
      });
    }
    groupsMap.get(key).items.push(item);
  });

  const uniqueEventIds = Array.from(new Set(cartDoc.items.map((item) => String(item.eventId))));
  const events = await Event.find({ _id: { $in: uniqueEventIds } })
    .select("name description dateTime bannerImageUrl purchaseMode venueId organizationId")
    .populate("venueId", "name city")
    .populate("organizationId", "name slug")
    .lean();
  const eventById = new Map(events.map((event) => [String(event._id), event]));

  const resultList = [];
  for (const group of groupsMap.values()) {
    const event = eventById.get(String(group.eventId));
    if (!event) continue;

    resultList.push({
      organizationId: String(event.organizationId?._id || event.organizationId),
      organizationSlug: event.organizationId?.slug,
      organizationName: event.organizationId?.name,
      eventId: String(group.eventId),
      sessionId: group.sessionId,
      event,
      items: group.items,
      total: group.items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0),
    });
  }

  return resultList;
};

const removeGlobalCartItem = async (req, { eventId, blockId, seatId, ticketTypeIndex }) => {
  const cartDoc = await getUnifiedCart(req);
  
  if (blockId && seatId) {
    cartDoc.items = cartDoc.items.filter((item) => 
      !(String(item.eventId) === String(eventId) && item.blockId === blockId && item.seatId === seatId)
    );
  } else {
    const index = Number(ticketTypeIndex);
    if (!Number.isInteger(index) || index < 0) {
      const error = new Error("A valid cart item is required");
      error.statusCode = 400;
      throw error;
    }
    cartDoc.items = cartDoc.items.filter((item) => 
      !(String(item.eventId) === String(eventId) && item.ticketTypeIndex === index)
    );
  }
  await cartDoc.save();
  
  const event = await Event.findById(eventId).select("organizationId").lean();
  const organizationId = event ? String(event.organizationId) : "";

  return formatEventCart(cartDoc, organizationId, eventId);
};

const addBundleToCart = async (req, organizationId, bundleId) => {
  const EventBundle = require("../models/EventBundle");
  const bundle = await EventBundle.findOne({ _id: bundleId, organizationId }).lean();
  if (!bundle) {
    const error = new Error("Bundle not found");
    error.statusCode = 404;
    throw error;
  }

  const cartDoc = await getUnifiedCart(req);
  const selections = cartDoc.items.filter((item) => String(item.bundleId || "") === String(bundleId) && item.itemType !== "bundle");
  const eventIds = bundle.eventIds.map(String);
  const quantities = eventIds.map((eventId) => selections.filter((item) => String(item.eventId) === eventId).length);
  const quantity = quantities[0];
  if (!quantity || quantities.some((count) => count !== quantity)) {
    const error = new Error("Select the same number of seats for every event in this bundle before adding it to your cart.");
    error.statusCode = 400;
    throw error;
  }

  // Until this point the cart contains zero-priced, temporary seat holds for
  // each event in the bundle. Replace all of them in one saved document with
  // one priced bundle item; they must never be rendered as payable items.
  const nonBundleItems = cartDoc.items
    .filter((item) => String(item.bundleId || "") !== String(bundleId))
    .map((item) => (item.toObject ? item.toObject() : item));
  const bundleCartItem = {
    eventId: bundle.eventIds[0],
    itemType: "bundle",
    bundleId: bundle._id,
    bundleName: bundle.name,
    bundleBannerImageUrl: bundle.bannerImageUrl || null,
    bundleQuantity: quantity,
    quantity: 1,
    unitPrice: Number(bundle.pricePerSeat) * quantity,
    bundleSelections: selections.map((item) => ({
      eventId: item.eventId,
      eventSessionId: item.eventSessionId || null,
      blockId: item.blockId,
      seatId: item.seatId,
      seatName: item.seatName || null,
      sectionName: item.sectionName || null,
    })),
  };
  cartDoc.set("items", [...nonBundleItems, bundleCartItem]);
  cartDoc.markModified("items");
  await cartDoc.save();

  // Return the persisted cart rather than the pre-save Mongoose instance so
  // the client always receives the single bundle item, including for guests.
  const savedCart = await Cart.findById(cartDoc._id);
  const persistedBundle = savedCart?.items?.find(
    (item) => item.itemType === "bundle" && String(item.bundleId) === String(bundleId)
  );
  if (!persistedBundle) {
    const error = new Error("Could not finalize the bundle in your cart. Please try again.");
    error.statusCode = 500;
    throw error;
  }
  return savedCart;
};

const removeBundleFromCart = async (req, bundleId) => {
  const cartDoc = await getUnifiedCart(req);
  cartDoc.items = cartDoc.items.filter((item) => String(item.bundleId || "") !== String(bundleId));
  await cartDoc.save();
  return cartDoc;
};

const restoreBundleSelections = async (req, organizationId, bundleId) => {
  const EventBundle = require("../models/EventBundle");
  const bundle = await EventBundle.findOne({ _id: bundleId, organizationId }).lean();
  if (!bundle) {
    const error = new Error("Bundle not found");
    error.statusCode = 404;
    throw error;
  }
  const cartDoc = await getUnifiedCart(req);
  const bundleItem = cartDoc.items.find((item) => item.itemType === "bundle" && String(item.bundleId) === String(bundleId));
  if (!bundleItem) {
    const error = new Error("This bundle is no longer in your cart.");
    error.statusCode = 404;
    throw error;
  }

  cartDoc.items = cartDoc.items.filter((item) => !(item.itemType === "bundle" && String(item.bundleId) === String(bundleId)));
  bundleItem.bundleSelections.forEach((selection) => cartDoc.items.push({
    eventId: selection.eventId,
    eventSessionId: selection.eventSessionId || null,
    blockId: selection.blockId,
    seatId: selection.seatId,
    seatName: selection.seatName || null,
    sectionName: selection.sectionName || null,
    itemType: "event",
    bundleId: bundle._id,
    bundleName: bundle.name,
    quantity: 1,
    unitPrice: 0,
  }));
  await cartDoc.save();
  return cartDoc;
};

module.exports = {
  getCartByEvent,
  addItem,
  addSeat,
  updateItem,
  removeItem,
  removeSeat,
  clearCart,
  getAllSessionCarts,
  removeGlobalCartItem,
  addBundleToCart,
  removeBundleFromCart,
  restoreBundleSelections,
};
