const express = require("express");
const aiController = require("../controllers/ai.controller");
const authenticate = require("../middlewares/authenticate");
const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

const router = express.Router();

/**
 * Optional Authentication Middleware
 * Decodes the Bearer token if present to greet users by name,
 * but allows guests to proceed without throwing 401 errors.
 */
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
  } catch (err) {
    console.warn("[AI Auth] Optional auth token parse failed:", err.message);
  }
  next();
};

// General/Guest route
router.post("/chat", optionalAuthenticate, aiController.chat);

// Persistent Chat Sessions endpoints (Super Admin or authenticated users)
router.get("/sessions", authenticate, aiController.getSessions);
router.get("/sessions/:sessionId", authenticate, aiController.getSessionById);
router.post("/sessions", authenticate, aiController.createSession);
router.post("/sessions/:sessionId/message", authenticate, aiController.addMessageToSession);
router.delete("/sessions/:sessionId", authenticate, aiController.deleteSession);

module.exports = router;
