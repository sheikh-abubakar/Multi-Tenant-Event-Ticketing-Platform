const express = require("express");
const authController = require("../controllers/auth.controller");
const authenticate = require("../middlewares/authenticate");

const router = express.Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);

// Protected test route: proves the authenticate middleware works.
// Only checks "who is this user" — no org/role logic here (that
// comes with the tenant-resolution middleware, Week 1 Day 3).
router.get("/me", authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
