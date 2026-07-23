const cartService = require("../services/cart.service");

const getCart = async (req, res) => {
  try {
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
