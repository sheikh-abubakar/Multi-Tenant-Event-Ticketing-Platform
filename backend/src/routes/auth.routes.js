const express = require("express");
const authController = require("../controllers/auth.controller");
const authenticate = require("../middlewares/authenticate");

const router = express.Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/google", authController.googleSignIn);

// Protected test route: proves the authenticate middleware works.
// Only checks "who is this user" — no org/role logic here (that
// comes with the tenant-resolution middleware, Week 1 Day 3).
router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

// Profile & Password Updates
router.put("/profile", authenticate, authController.updateProfile);
router.put("/password", authenticate, authController.updatePassword);

// Password Recovery
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
