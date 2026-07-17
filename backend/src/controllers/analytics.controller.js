const analyticsService = require("../services/analytics.service");

/**
 * GET /api/o/:orgSlug/analytics
 * Returns full analytics payload for the organization dashboard.
 */
const getAnalytics = async (req, res) => {
  try {
    const data = await analyticsService.getOwnerAnalytics(req.organizationId);
    return res.json(data);
  } catch (error) {
    console.error("[Analytics] Error:", error);
    return res.status(500).json({ message: "Could not load analytics data." });
  }
};

module.exports = { getAnalytics };