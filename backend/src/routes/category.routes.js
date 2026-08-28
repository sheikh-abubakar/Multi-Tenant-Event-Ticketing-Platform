const express = require("express");
const authenticate = require("../middlewares/authenticate");
const categoryController = require("../controllers/category.controller");

const router = express.Router();

// Publicly read categories
router.get("/", categoryController.list);

// Authenticated users can create categories (e.g. from event creation page if needed)
router.post("/", authenticate, categoryController.create);

// Track category tag interaction clicks
router.post("/:categoryId/interact", authenticate, categoryController.interact);

module.exports = router;
