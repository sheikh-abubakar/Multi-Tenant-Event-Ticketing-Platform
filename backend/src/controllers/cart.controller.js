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
  
  const isEventProtected = event.accessCode && (!event.privateCodeExpiry || new Date(event.privateCodeExpiry) > new Date());
  if (isEventProtected) {
    const eventCode = (req.headers["x-event-access-code"] || req.query.accessCode || "").trim();
    const bundleCode = (req.headers["x-bundle-access-code"] || req.query.bundleAccessCode || "").trim();
    const queryBundleId = req.body?.bundleId || req.query?.bundleId || req.headers["x-bundle-id"];
    
    let unlocked = false;
    
    // 1. Direct event access code check
    if (eventCode && eventCode === event.accessCode) {
      unlocked = true;
    }
    
    // 2. Bundle access check
    if (!unlocked && (queryBundleId || bundleCode)) {
      let bundleFilter = { eventIds: event._id, organizationId };
      if (queryBundleId) {
        bundleFilter._id = queryBundleId;
      } else {
        bundleFilter.accessCode = bundleCode;
      }
      
      const bundle = await EventBundle.findOne(bundleFilter);
      if (bundle) {
        const isBundleProtected = bundle.accessCode && (!bundle.privateCodeExpiry || new Date(bundle.privateCodeExpiry) > new Date());
        if (!isBundleProtected) {
          unlocked = true;
        } else if (bundleCode && bundleCode === bundle.accessCode) {
          unlocked = true;
        }
      }
    }
    
    if (!unlocked) {
      const err = new Error("This event is protected. A valid access code is required.");
      err.statusCode = 403;
      err.isProtected = true;
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
      req.query.EventSeatMapSessionID || req.query.sessionId
    );
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message, isProtected: error.isProtected });
  }
 };
 
 const addItem = async (req, res) => {
  try {
    await verifyAccessForEvent(req, req.params.eventId, req.organizationId);
    const cart = await cartService.addItem(
      req,
      req.organizationId,
      req.params.eventId,
      { ...req.body, sessionId: req.query.EventSeatMapSessionID || req.query.sessionId || req.body.EventSeatMapSessionID || req.body.sessionId }
    );
    return res.status(200).json({ cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message, isProtected: error.isProtected });
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
    return res.status(error.statusCode || 500).json({ message: error.message, isProtected: error.isProtected });
  }
 };
 
 const removeItem = async (req, res) => {
  try {
    const cart = await cartService.removeItem(
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
    const cart = await cartService.clearCart(
      req,
      req.organizationId,
      req.params.eventId,
      req.query.EventSeatMapSessionID || req.query.sessionId || req.body.EventSeatMapSessionID || req.body.sessionId
    );
    return res.status(200).json({ cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
 };
 
 const removeSeat = async (req, res) => {
   try { const cart = await cartService.removeSeat(req, req.organizationId, req.params.eventId, req.params.blockId, req.params.seatId, req.query.EventSeatMapSessionID || req.query.sessionId); return res.json({ cart }); }
   catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
 };
 
 module.exports = { getCart, addItem, updateItem, removeItem, removeSeat, clearCart };
