const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");
const couponController = require("../controllers/coupon.controller");

const router = express.Router({ mergeParams: true });

// Storefront Public: Validate coupon before starting checkout (NO AUTH REQUIRED FOR BUYERS)
router.post("/validate", resolveTenant, couponController.validate);
router.post("/cart/:eventId/validate-coupon", resolveTenant, couponController.validate);

// Organizer Admin middleware stack
const adminMiddleware = [authenticate, resolveTenant, loadMembership];

// Organizer Admin: Manage coupons (scoped to organization)
router.post("/", ...adminMiddleware, checkPermission("coupons:create"), couponController.create);
router.get("/", ...adminMiddleware, checkPermission("coupons:read"), couponController.list);
router.put("/:couponId", ...adminMiddleware, checkPermission("coupons:update"), couponController.update);
router.delete("/:couponId", ...adminMiddleware, checkPermission("coupons:delete"), couponController.remove);

module.exports = router;
