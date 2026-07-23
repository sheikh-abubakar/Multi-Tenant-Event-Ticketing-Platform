const cartService = require("../services/cart.service");

const getAll = async (req, res) => {
  try {
    return res.json({ carts: await cartService.getAllSessionCarts(req) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const removeItem = async (req, res) => {
  try {
    const cart = cartService.removeGlobalCartItem(req, req.body);
    return res.json({ cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { getAll, removeItem };
