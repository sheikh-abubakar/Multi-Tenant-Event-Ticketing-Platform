const crypto = require("crypto");
const User = require("../models/User");
const ReferralReward = require("../models/ReferralReward");

/**
 * Generate a unique 8-character referral code (e.g. REF-A1B2C3)
 */
function generateReferralCode() {
  const hex = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `REF-${hex}`;
}

/**
 * Get or create referral code for a user
 */
async function getUserReferralCode(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.referralCode) {
    return user.referralCode;
  }

  // Generate unique code
  let code;
  let isUnique = false;
  while (!isUnique) {
    code = generateReferralCode();
    const existing = await User.findOne({ referralCode: code });
    if (!existing) {
      isUnique = true;
    }
  }

  user.referralCode = code;
  await user.save();
  return code;
}

/**
 * Process referral reward when a referred friend's booking is confirmed
 */
async function processBookingReferral(booking) {
  if (!booking || !booking.referredByCode) {
    console.log("[Referral] No referredByCode on booking — skipping reward.");
    return null; // No referral code used
  }

  console.log(`[Referral] Processing reward for booking ${booking._id} with code: ${booking.referredByCode}`);

  const referrer = await User.findOne({ referralCode: booking.referredByCode });
  if (!referrer) {
    console.warn(`[Referral] No user found with referralCode: ${booking.referredByCode}`);
    return null; // Invalid referral code
  }

  console.log(`[Referral] Referrer found: ${referrer.email} (id: ${referrer._id})`);

  // Prevent self-referral
  if (referrer.email.toLowerCase() === booking.buyerEmail.toLowerCase()) {
    console.warn(`[Referral] Self-referral blocked for ${referrer.email}`);
    return null;
  }

  // Check unique referred email rule: referrer can only earn ONE reward per referred friend's email
  const existingReward = await ReferralReward.findOne({
    referrerUserId: referrer._id,
    referredEmail: booking.buyerEmail.toLowerCase(),
  });

  if (existingReward) {
    console.log(`[Referral] Reward already exists for referrer ${referrer.email} → friend ${booking.buyerEmail}. Skipping.`);
    return null; // Reward already earned for this friend email previously
  }

  // Award 10% discount reward to referrer
  try {
    const reward = await ReferralReward.create({
      referrerUserId: referrer._id,
      referredBookingId: booking._id,
      referredEmail: booking.buyerEmail.toLowerCase(),
      discountPercent: 10,
      status: "available",
    });
    console.log(`[Referral] ✅ Reward created! Referrer ${referrer.email} earns 10% off. Reward ID: ${reward._id}`);
    return reward;
  } catch (err) {
    // Handle duplicate key race condition gracefully
    if (err.code === 11000) {
      console.warn("[Referral] Duplicate key — reward already exists (race condition).");
      return null;
    }
    throw err;
  }
}

/**
 * Get user referral stats and available rewards count
 */
async function getReferralStats(userId) {
  const referralCode = await getUserReferralCode(userId);

  const availableRewards = await ReferralReward.find({
    referrerUserId: userId,
    status: "available",
  }).sort({ createdAt: -1 });

  const usedRewards = await ReferralReward.find({
    referrerUserId: userId,
    status: "used",
  }).sort({ updatedAt: -1 });

  return {
    referralCode,
    availableRewardsCount: availableRewards.length,
    totalEarnedCount: availableRewards.length + usedRewards.length,
    availableRewards,
    usedRewardsHistory: usedRewards,
  };
}

/**
 * Reserve/calculate referral reward discount for checkout (Max 50% / 5 rewards)
 */
async function calculateReferralDiscount(userId, rewardsToApply, originalTotal) {
  const count = Math.min(Math.max(0, parseInt(rewardsToApply, 10) || 0), 5);
  if (count <= 0) {
    return { rewardsToApplyCount: 0, discountPercent: 0, discountAmount: 0, finalTotal: originalTotal, rewardIds: [] };
  }

  // Fetch available rewards
  const availableRewards = await ReferralReward.find({
    referrerUserId: userId,
    status: "available",
  }).limit(count);

  if (availableRewards.length < count) {
    throw new Error(`Insufficient referral rewards available. Requested ${count}, but only ${availableRewards.length} available.`);
  }

  const discountPercent = count * 10; // e.g. 3 rewards = 30% discount
  const discountAmount = Math.round((originalTotal * discountPercent) / 100);
  const finalTotal = Math.max(0, originalTotal - discountAmount);
  const rewardIds = availableRewards.map((r) => r._id);

  return {
    rewardsToApplyCount: count,
    discountPercent,
    discountAmount,
    finalTotal,
    rewardIds,
  };
}

/**
 * Mark rewards as used after payment confirmation
 */
async function consumeReferralRewards(userId, rewardsCount, bookingId) {
  if (!rewardsCount || rewardsCount <= 0) return;

  const count = Math.min(rewardsCount, 5);
  const availableRewards = await ReferralReward.find({
    referrerUserId: userId,
    status: "available",
  }).limit(count);

  const rewardIds = availableRewards.map((r) => r._id);
  if (rewardIds.length > 0) {
    await ReferralReward.updateMany(
      { _id: { $in: rewardIds } },
      { $set: { status: "used", usedInBookingId: bookingId } }
    );
  }
}

module.exports = {
  getUserReferralCode,
  processBookingReferral,
  getReferralStats,
  calculateReferralDiscount,
  consumeReferralRewards,
};
