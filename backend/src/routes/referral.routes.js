const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authenticate");
const referralController = require("../controllers/referral.controller");

// All referral routes require authentication
router.use(authenticate);

router.get("/me", referralController.getMyReferrals);

module.exports = router;
