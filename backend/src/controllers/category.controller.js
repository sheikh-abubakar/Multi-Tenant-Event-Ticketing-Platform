const Category = require("../models/Category");

const list = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }).lean();
    return res.json({ categories });
  } catch (error) {
    console.error("Error listing categories:", error);
    return res.status(500).json({ message: "Could not load categories." });
  }
};

const create = async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) {
      return res.status(400).json({ message: "Category name is required." });
    }

    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const existing = await Category.findOne({ $or: [{ name }, { slug }] });
    if (existing) {
      return res.status(400).json({ message: "Category already exists." });
    }

    const category = await Category.create({ name, slug, icon: icon || "Sparkles" });
    return res.status(201).json({ category });
  } catch (error) {
    console.error("Error creating category:", error);
    return res.status(500).json({ message: "Could not create category." });
  }
};

const interact = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.json({ success: true, message: "Guest interaction skipped" });
    }

    const User = require("../models/User");
    const mongoose = require("mongoose");

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.categoryInterests) {
      user.categoryInterests = [];
    }

    const existing = user.categoryInterests.find(item => item.categoryId?.toString() === categoryId);
    if (existing) {
      existing.score += 1;
      existing.lastInteracted = new Date();
    } else {
      user.categoryInterests.push({
        categoryId: new mongoose.Types.ObjectId(categoryId),
        score: 1,
        lastInteracted: new Date()
      });
    }

    await user.save();
    return res.json({ success: true, categoryInterests: user.categoryInterests });
  } catch (error) {
    console.error("Error in category interaction:", error);
    return res.status(500).json({ message: "Error tracking category interaction" });
  }
};

module.exports = { list, create, interact };
