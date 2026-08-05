const cartService = require("../services/cart.service");

const verifyAccessForEvent = async (req, eventId, organizationId) => {
  const Event = require("../models/Event");
  const EventBundle = require("../models/EventBundle");
  
  const event = await Event.findOne({ _id: eventId, organizationId }).lean();
  if (!event) {
    const err = new Error("Event not found.");
    err.statusCode = 404;
    throw err;
  }
  
  if (event.accessCode) {
    const eventCode = (req.headers["x-event-access-code"] || req.query.accessCode || "").trim();
    const bundleCode = (req.headers["x-bundle-access-code"] || req.query.bundleAccessCode || "").trim();
    
    let unlocked = false;
    
    // 1. Direct event access code check
    if (eventCode && eventCode === event.accessCode) {
      unlocked = true;
    }
    
    // 2. Bundle access code override check (Case 2)
    if (!unlocked && bundleCode) {
      const bundle = await EventBundle.findOne({
        eventIds: event._id,
        organizationId,
        accessCode: bundleCode,
      });
      if (bundle) {
        unlocked = true;
      }
    }
    
    if (!unlocked) {
      const err = new Error("This event is protected. A valid access code is required.");
      err.statusCode = 403;
      throw err;
    }
  }
};

const getCart = async (req, res) => {
  try {
    await verifyAccessForEvent(req, req.params.eventId, req.organizationId);
    const result = await cartService.getCartByEvent(
      req,
      req.organizationId,
      req.params.eventId,
    );
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const addItem = async (req, res) => {
  try {
    await verifyAccessForEvent(req, req.params.eventId, req.organizationId);
    const cart = await cartService.addItem(
      req,
      req.organizationId,
      req.params.eventId,
      req.body,
    );
    return res.status(200).json({ cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const updateItem = async (req, res) => {
  try {
    await verifyAccessForEvent(req, req.params.eventId, req.organizationId);
    const cart = await cartService.updateItem(
      req,
      req.organizationId,
      req.params.eventId,
      req.body,
    );
    return res.status(200).json({ cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const removeItem = async (req, res) => {
  try {
    const cart = cartService.removeItem(
      req,
      req.organizationId,
      req.params.eventId,
      req.params.ticketTypeIndex,
    );
    return res.status(200).json({ cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const clearCart = async (req, res) => {
  try {
    const cart = cartService.clearCart(
      req,
      req.organizationId,
      req.params.eventId,
    );
    return res.status(200).json({ cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const removeSeat = async (req, res) => {
  try { const cart = cartService.removeSeat(req, req.organizationId, req.params.eventId, req.params.blockId, req.params.seatId); return res.json({ cart }); }
  catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
};

module.exports = { getCart, addItem, updateItem, removeItem, removeSeat, clearCart };
