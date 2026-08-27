const express = require("express");
const authenticate = require("../middlewares/authenticate");
const controller = require("../controllers/recommendation.controller");

const router = express.Router();

router.get("/", authenticate, controller.getRecommendations);

module.exports = router;
