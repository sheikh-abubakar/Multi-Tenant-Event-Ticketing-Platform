const express = require("express");
const controller = require("../controllers/globalCart.controller");

const router = express.Router();

// A personal cart is session-scoped and groups the user's existing per-event carts.
router.get("/", controller.getAll);
router.delete("/items", controller.removeItem);
router.post("/coupons/validate", controller.validateCoupon);

module.exports = router;
