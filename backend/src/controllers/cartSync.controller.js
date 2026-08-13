const cartSyncService = require("../services/cartSync.service");

const getCartId = (req) => {
  return req.query.cartId || req.body.cartId || req.headers["x-cart-id"] || "guest-session";
};

const getCart = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const cartId = getCartId(req);
    const cart = await cartSyncService.getCart(userId, cartId);
    return res.status(200).json({ status: "success", cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", message: error.message });
  }
};

const syncCart = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const cartId = getCartId(req);
    const { items } = req.body;
    const cart = await cartSyncService.syncCart(userId, cartId, items || []);
    return res.status(200).json({ status: "success", cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", message: error.message });
  }
};

const lockSeat = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const cartId = getCartId(req);
    const cart = await cartSyncService.lockSeat(userId, cartId, req.body);
    return res.status(200).json({ status: "success", cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", message: error.message });
  }
};

const unlockSeat = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const cartId = getCartId(req);
    const cart = await cartSyncService.unlockSeat(userId, cartId, req.body);
    return res.status(200).json({ status: "success", cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", message: error.message });
  }
};

const clearCart = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const cartId = getCartId(req);
    const cart = await cartSyncService.clearCartItems(userId, cartId);
    return res.status(200).json({ status: "success", cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", message: error.message });
  }
};

const claimGuestCart = async (req, res) => {
  try {
    const guestCartId = req.body.guestCartId || req.headers["x-cart-id"];
    const cart = await cartSyncService.claimGuestCart(req.user._id, guestCartId);
    return res.status(200).json({ status: "success", cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ status: "error", message: error.message });
  }
};

module.exports = {
  getCart,
  syncCart,
  lockSeat,
  unlockSeat,
  clearCart,
  claimGuestCart,
};
