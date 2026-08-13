const express = require("express");
const cartSyncController = require("../controllers/cartSync.controller");
const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");
const authenticate = require("../middlewares/authenticate");

const router = express.Router();

// Optional authentication middleware: if token exists, verify it and attach user,
// but do NOT fail/reject the request if no token is provided (so guests can use it).
const optionalAuthenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.userId).select("-passwordHash");
      if (user) {
        req.user = user;
      }
    }
    next();
  } catch (error) {
    // If token validation fails, proceed as guest
    next();
  }
};

router.get("/", optionalAuthenticate, cartSyncController.getCart);
router.post("/sync", optionalAuthenticate, cartSyncController.syncCart);
router.post("/lock", optionalAuthenticate, cartSyncController.lockSeat);
router.post("/unlock", optionalAuthenticate, cartSyncController.unlockSeat);
router.delete("/", optionalAuthenticate, cartSyncController.clearCart);
router.post("/claim", authenticate, cartSyncController.claimGuestCart);

module.exports = router;
