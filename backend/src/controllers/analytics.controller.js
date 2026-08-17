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

const getEventAnalytics = async (req, res) => {
  try {
    const data = await analyticsService.getEventAnalytics(req.organizationId, req.params.eventId);
    return res.json(data);
  } catch (error) {
    console.error("[Event Analytics] Error:", error);
    return res.status(error.statusCode || 500).json({ message: error.message || "Could not load event analytics data." });
  }
};

const getBookingDetail = async (req, res) => {
  try {
    const detail = await analyticsService.getBookingDetail(req.organizationId, req.params.bookingId);
    return res.json({ detail });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message || "Could not load booking details." });
  }
};

module.exports = { getAnalytics, getEventAnalytics, getBookingDetail };
