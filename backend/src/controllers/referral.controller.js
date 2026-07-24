const referralService = require("../services/referral.service");

/**
 * GET /api/referrals/me
 * Returns current user's referral code, available rewards, and history
 */
async function getMyReferrals(req, res) {
  try {
    const stats = await referralService.getReferralStats(req.user._id);
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Failed to fetch referral details",
    });
  }
}

module.exports = {
  getMyReferrals,
};
