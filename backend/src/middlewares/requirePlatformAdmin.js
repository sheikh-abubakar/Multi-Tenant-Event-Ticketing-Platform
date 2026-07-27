const requirePlatformAdmin = (req, res, next) => {
  if (req.user?.platformRole !== "super_admin") {
    return res.status(403).json({ message: "Platform Super Admin access is required" });
  }
  next();
};

module.exports = requirePlatformAdmin;
