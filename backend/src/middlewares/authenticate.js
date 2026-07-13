const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

/**
 * "authenticate" is step 1 of the pipeline:
 *   authenticate → resolve org → load membership → check role
 *
 * This middleware ONLY proves global identity — "who is this person,
 * and are they really logged in?". It attaches req.user and stops
 * there. It does NOT check which organization the request is for,
 * and it does NOT check any role/permission.
 *
 * The org-resolution and role-checking middlewares (Week 1, Day 3-4)
 * will run AFTER this one, and they are what actually decide whether
 * this authenticated user can touch a given tenant's data.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);

    const user = await User.findById(decoded.userId).select("-passwordHash");
    if (!user) {
      return res.status(401).json({ message: "User no longer exists" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

module.exports = authenticate;
