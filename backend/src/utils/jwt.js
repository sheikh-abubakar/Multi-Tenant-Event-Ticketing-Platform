const jwt = require("jsonwebtoken");

/**
 * Signs a JWT containing ONLY the user's global identity (userId).
 *
 * Deliberately does NOT include organizationId or role here.
 * Why: a single token is used across ALL of a user's organizations.
 * The org/role context is resolved fresh on every request (via
 * tenant-resolution + membership-lookup middleware), not baked into
 * the token. This is what "authentication is global, authorization
 * is per-request" means in practice.
 */
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = { generateToken, verifyToken };
