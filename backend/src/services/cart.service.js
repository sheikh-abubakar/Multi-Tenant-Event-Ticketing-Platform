const Event = require("../models/Event");

const normalizeSessionId = (sessionId) => {
  if (!sessionId || sessionId === "undefined" || sessionId === "null") return null;
  return String(sessionId);
};

const getSessionCartKey = (organizationId, eventId, sessionId = null) => {
  const cleanSessionId = normalizeSessionId(sessionId);
  return cleanSessionId 
    ? `cart:${organizationId}:${eventId}:${cleanSessionId}`
    : `cart:${organizationId}:${eventId}`;
};

const getOrCreateCart = (req, organizationId, eventId, sessionId = null) => {
  if (!req.session.carts) {
    req.session.carts = {};
  }

  const cleanSessionId = normalizeSessionId(sessionId);
  const cartKey = getSessionCartKey(organizationId, eventId, cleanSessionId);

  if (!req.session.carts[cartKey]) {
    req.session.carts[cartKey] = {
      organizationId,
      eventId,
      sessionId: cleanSessionId,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return req.session.carts[cartKey];
};

const saveCart = (req, organizationId, eventId, cart, sessionId = null) => {
  if (!req.session.carts) {
    req.session.carts = {};
  }

  const cleanSessionId = normalizeSessionId(sessionId);
  const cartKey = getSessionCartKey(organizationId, eventId, cleanSessionId);
  req.session.carts[cartKey] = {
    ...cart,
    updatedAt: new Date().toISOString(),
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

  const cart = getOrCreateCart(req, organizationId, eventId, cleanSessionId);

  // A browser session can retain cart entries after payment/expiry. Reconcile
  // seat entries with the authoritative live map so a sold/held seat cannot
  // stay visually selected or be submitted again from that same browser.
  if (event.purchaseMode === "seatmap" && cart.items?.some((item) => item.blockId && item.seatId)) {
    const activeSession = (cleanSessionId && event.sessions?.find((item) => String(item._id) === String(cleanSessionId)))
      || event.sessions?.find((item) => new Date(item.dateTime) >= new Date())
      || event.sessions?.[0];
    const seatmap = activeSession?.selectedSeatMap || event.selectedSeatMap;
    if (seatmap?.blocks) {
      const before = cart.items.length;
      cart.items = cart.items.filter((item) => {
        if (!item.blockId || !item.seatId) return true;
        const seat = seatmap.blocks.find((block) => block.id === item.blockId)?.seats?.find((candidate) => candidate.id === item.seatId);
        return seat?.status === "available";
      });
      if (cart.items.length !== before) saveCart(req, organizationId, eventId, cart, cleanSessionId);
    }
  }

  return {
    event,
    cart,
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

  const cart = getOrCreateCart(req, organizationId, eventId);
  const existingItem = cart.items.find(
    (item) => item.ticketTypeIndex === ticketTypeIdx,
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
    cart.items.push({
      ticketTypeIndex: ticketTypeIdx,
      ticketTypeName: ticketType.name,
      quantity: qty,
      unitPrice: Number(ticketType.price),
    });
  }

  saveCart(req, organizationId, eventId, cart);

  return cart;
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
  const cart = getOrCreateCart(req, organizationId, eventId, cleanSessionId);
  if (!cart.items.some((item) => item.blockId === blockId && item.seatId === seatId)) {
    const finalPrice = overridePrice !== undefined && overridePrice !== null ? Number(overridePrice) : Number(block.price || 0);
    cart.items.push({ blockId, seatId, seatName: seat.seatName, sectionName: block.name, category: block.category || null, quantity: 1, unitPrice: finalPrice });
  }
  saveCart(req, organizationId, eventId, cart, cleanSessionId); return cart;
};

const removeSeat = (req, organizationId, eventId, blockId, seatId, sessionId) => {
  const cleanSessionId = normalizeSessionId(sessionId);
  const cart = getOrCreateCart(req, organizationId, eventId, cleanSessionId);
  cart.items = cart.items.filter((item) => item.blockId !== blockId || item.seatId !== seatId);
  saveCart(req, organizationId, eventId, cart, cleanSessionId); return cart;
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

  const cart = getOrCreateCart(req, organizationId, eventId);
  const itemIndex = cart.items.findIndex(
    (item) => item.ticketTypeIndex === ticketTypeIdx,
  );

  if (qty === 0) {
    if (itemIndex !== -1) {
      cart.items.splice(itemIndex, 1);
    }
    saveCart(req, organizationId, eventId, cart);
    return cart;
  }

  const remaining =
    Number(ticketType.quantityTotal) - Number(ticketType.quantityBooked || 0);

  if (qty > remaining) {
    const error = new Error(`Not enough tickets left for ${ticketType.name}`);
    error.statusCode = 409;
    throw error;
  }

  if (itemIndex !== -1) {
    cart.items[itemIndex].quantity = qty;
  } else {
    cart.items.push({
      ticketTypeIndex: ticketTypeIdx,
      ticketTypeName: ticketType.name,
      quantity: qty,
      unitPrice: Number(ticketType.price),
    });
  }

  saveCart(req, organizationId, eventId, cart);

  return cart;
};

const removeItem = (req, organizationId, eventId, ticketTypeIndex) => {
  const ticketTypeIdx = Number(ticketTypeIndex);

  if (!Number.isInteger(ticketTypeIdx) || ticketTypeIdx < 0) {
    const error = new Error("ticketTypeIndex is required and must be valid");
    error.statusCode = 400;
    throw error;
  }

  const cart = getOrCreateCart(req, organizationId, eventId);
  cart.items = cart.items.filter(
    (item) => item.ticketTypeIndex !== ticketTypeIdx,
  );

  saveCart(req, organizationId, eventId, cart);

  return cart;
};

const clearCart = (req, organizationId, eventId, sessionId) => {
  const cleanSessionId = normalizeSessionId(sessionId);
  const cartKey = getSessionCartKey(organizationId, eventId, cleanSessionId);

  if (req.session.carts && req.session.carts[cartKey]) {
    delete req.session.carts[cartKey];
  }

  return {
    organizationId,
    eventId,
    sessionId: cleanSessionId,
    items: [],
  };
};

const getAllSessionCarts = async (req) => {
  const sessionCarts = Object.values(req.session?.carts || {}).filter((cart) => cart.items?.length);
  if (!sessionCarts.length) return [];

  const events = await Event.find({ _id: { $in: sessionCarts.map((cart) => cart.eventId) } })
    .select("name description dateTime bannerImageUrl purchaseMode venueId organizationId")
    .populate("venueId", "name city")
    .populate("organizationId", "name slug")
    .lean();
  const eventById = new Map(events.map((event) => [String(event._id), event]));

  return sessionCarts.flatMap((cart) => {
    const event = eventById.get(String(cart.eventId));
    if (!event || String(event.organizationId?._id || event.organizationId) !== String(cart.organizationId)) return [];
    return [{
      organizationId: String(cart.organizationId),
      organizationSlug: event.organizationId?.slug,
      organizationName: event.organizationId?.name,
      eventId: String(cart.eventId),
      sessionId: cart.sessionId,
      event,
      items: cart.items,
      total: cart.items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0),
    }];
  });
};

const removeGlobalCartItem = (req, { eventId, blockId, seatId, ticketTypeIndex }) => {
  const cart = Object.values(req.session?.carts || {}).find((item) => String(item.eventId) === String(eventId));
  if (!cart) {
    const error = new Error("Cart not found");
    error.statusCode = 404;
    throw error;
  }
  if (blockId && seatId) {
    cart.items = cart.items.filter((item) => item.blockId !== blockId || item.seatId !== seatId);
  } else {
    const index = Number(ticketTypeIndex);
    if (!Number.isInteger(index) || index < 0) {
      const error = new Error("A valid cart item is required");
      error.statusCode = 400;
      throw error;
    }
    cart.items = cart.items.filter((item) => item.ticketTypeIndex !== index);
  }
  saveCart(req, cart.organizationId, cart.eventId, cart);
  return cart;
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
};
