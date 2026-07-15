const express = require("express");
const resolveTenant = require("../middlewares/resolveTenant");
const cartController = require("../controllers/cart.controller");

const router = express.Router({ mergeParams: true });

// Cart is public for buyers, but always tenant-scoped via :orgSlug.
router.get("/:eventId", resolveTenant, cartController.getCart);
router.post("/:eventId/items", resolveTenant, cartController.addItem);
router.put("/:eventId/items", resolveTenant, cartController.updateItem);
router.delete("/:eventId/items/:ticketTypeIndex", resolveTenant, cartController.removeItem);
router.delete("/:eventId", resolveTenant, cartController.clearCart);

module.exports = router;