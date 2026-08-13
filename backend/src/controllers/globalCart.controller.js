const cartService = require("../services/cart.service");
const couponService = require("../services/coupon.service");
const Event = require("../models/Event");

const getAll = async (req, res) => {
  try {
    return res.json({ carts: await cartService.getAllSessionCarts(req) });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const removeItem = async (req, res) => {
  try {
    const cart = await cartService.removeGlobalCartItem(req, req.body);
    return res.json({ cart });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const validateCoupon = async (req, res) => {
  try {
    const { code, items = [] } = req.body;
    if (!code || !Array.isArray(items) || !items.length) return res.status(400).json({ message: "A coupon code and cart items are required." });
    const eventIds = [...new Set(items.map((item) => String(item.eventId)).filter(Boolean))];
    const events = await Event.find({ _id: { $in: eventIds } }).select("organizationId").lean();
    const organizations = new Map(events.map((event) => [String(event._id), String(event.organizationId)]));
    const purchases = items.map((item, index) => ({
      key: String(item.clientKey || index),
      organizationId: organizations.get(String(item.eventId)),
      eventId: item.eventId,
      bundleId: item.itemType === "bundle" ? item.bundleId : null,
      amount: Number(item.unitPrice || 0) * Number(item.quantity || 1),
    })).filter((item) => item.organizationId);
    const result = await couponService.calculateCartCouponDiscounts(purchases, code);
    if (!result.appliedCount) return res.status(400).json({ message: "This coupon is not active or applicable to any item in your cart." });
    return res.json({ ...result });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { getAll, removeItem, validateCoupon };
