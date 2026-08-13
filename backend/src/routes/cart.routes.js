const express = require("express");
const resolveTenant = require("../middlewares/resolveTenant");
const optionalAuthenticate = require("../middlewares/optionalAuthenticate");
const cartController = require("../controllers/cart.controller");

const router = express.Router({ mergeParams: true });

// Cart is public for buyers, but always tenant-scoped via :orgSlug.
router.get("/:eventId", optionalAuthenticate, resolveTenant, cartController.getCart);
router.post("/:eventId/items", optionalAuthenticate, resolveTenant, cartController.addItem);
router.delete("/:eventId/seats/:blockId/:seatId", optionalAuthenticate, resolveTenant, cartController.removeSeat);
router.put("/:eventId/items", optionalAuthenticate, resolveTenant, cartController.updateItem);
router.delete("/:eventId/items/:ticketTypeIndex", optionalAuthenticate, resolveTenant, cartController.removeItem);
router.delete("/:eventId", optionalAuthenticate, resolveTenant, cartController.clearCart);

module.exports = router;
