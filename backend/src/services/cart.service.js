const Event = require("../models/Event");

const getSessionCartKey = (organizationId, eventId) => {
  return `cart:${organizationId}:${eventId}`;
};

const getOrCreateCart = (req, organizationId, eventId) => {
  if (!req.session.carts) {
    req.session.carts = {};
  }

  const cartKey = getSessionCartKey(organizationId, eventId);

  if (!req.session.carts[cartKey]) {
    req.session.carts[cartKey] = {
      organizationId,
      eventId,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  return req.session.carts[cartKey];
};

const saveCart = (req, organizationId, eventId, cart) => {
  if (!req.session.carts) {
    req.session.carts = {};
  }

  const cartKey = getSessionCartKey(organizationId, eventId);
  req.session.carts[cartKey] = {
    ...cart,
    updatedAt: new Date().toISOString(),
  };
};

const getCartByEvent = async (req, organizationId, eventId) => {
  const event = await Event.findOne({ _id: eventId, organizationId })
    .select("name description dateTime bannerImageUrl ticketTypes purchaseMode venueId timezone")
    .populate("venueId", "name city")
    .lean();

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const cart = getOrCreateCart(req, organizationId, eventId);

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

const addSeat = async (req, organizationId, eventId, { blockId, seatId }) => {
  const event = await Event.findOne({ _id: eventId, organizationId });
  if (!event) { const error = new Error("Event not found"); error.statusCode = 404; throw error; }
  if (event.purchaseMode !== "seatmap" || !event.selectedSeatMap) { const error = new Error("This event does not use seat selection"); error.statusCode = 400; throw error; }
  const block = event.selectedSeatMap.blocks?.find((item) => item.id === blockId);
  const seat = block?.seats?.find((item) => item.id === seatId);
  if (!seat || !block) { const error = new Error("Seat not found"); error.statusCode = 404; throw error; }
  if (seat.status !== "available") { const error = new Error("This seat is no longer available"); error.statusCode = 409; throw error; }
  const cart = getOrCreateCart(req, organizationId, eventId);
  if (!cart.items.some((item) => item.blockId === blockId && item.seatId === seatId)) cart.items.push({ blockId, seatId, seatName: seat.seatName, sectionName: block.name, category: block.category || null, quantity: 1, unitPrice: Number(block.price || 0) });
  saveCart(req, organizationId, eventId, cart); return cart;
};

const removeSeat = (req, organizationId, eventId, blockId, seatId) => {
  const cart = getOrCreateCart(req, organizationId, eventId);
  cart.items = cart.items.filter((item) => item.blockId !== blockId || item.seatId !== seatId);
  saveCart(req, organizationId, eventId, cart); return cart;
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

const clearCart = (req, organizationId, eventId) => {
  const cartKey = getSessionCartKey(organizationId, eventId);

  if (req.session.carts && req.session.carts[cartKey]) {
    delete req.session.carts[cartKey];
  }

  return {
    organizationId,
    eventId,
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
