const { verifyToken } = require("../utils/jwt");
const User = require("../models/User");

// Buyer storefront routes must work for guests, while still resolving a
// signed-in buyer to the same server cart used by cart-sync.
module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const decoded = verifyToken(authHeader.slice(7));
      const user = await User.findById(decoded.userId).select("-passwordHash");
      if (user) req.user = user;
    }
  } catch {
    // Invalid/missing tokens remain guest requests; protected routes use the
    // mandatory authenticate middleware instead.
  }
  next();
};
