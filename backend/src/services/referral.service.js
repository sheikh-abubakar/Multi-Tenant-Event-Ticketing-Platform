const crypto = require("crypto");
const User = require("../models/User");
const ReferralReward = require("../models/ReferralReward");
const Event = require("../models/Event");
const EventBundle = require("../models/EventBundle");
const WalletTransaction = require("../models/WalletTransaction");
const walletService = require("./wallet.service");
const { notifyUser, notifyPlatformAdmin } = require("./notification.service");

const notifyRewardEarned = (referrerUserId, reward, buyer = {}) => {
  const referredBuyer = buyer.name?.trim() || buyer.email || reward.referredEmail;
  const isBundle = buyer.isBundleBooking || reward.referredBookingId?.isBundleBooking;
  const bName = buyer.bundleName || reward.referredBookingId?.bundleName;
  const eName = buyer.eventName || reward.referredBookingId?.eventName;

  const targetName = isBundle
    ? `bundle "${bName || "Bundle"}"`
    : `event "${eName || "Event"}"`;

  return notifyUser(referrerUserId, {
    type: "referral.reward-earned",
    title: "New referral reward earned",
    message: `${referredBuyer} used your referral link. You earned a $${Number(reward.rewardAmount || 0).toFixed(2)} cash reward in your wallet for their booking of ${targetName}.`,
    link: "/my/referrals",
    metadata: {
      rewardId: String(reward._id),
      bookingId: String(reward.referredBookingId),
      referredBuyerName: buyer.name || null,
      referredBuyerEmail: buyer.email || reward.referredEmail,
      rewardAmount: reward.rewardAmount,
    },
    // The reward ID is immutable and unique, so this makes both real-time
    // delivery and recovery after a server restart exactly-once.
    dedupeKey: `referral-reward-earned:${reward._id}`,
  });
};

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

  // Retrieve referral reward amount from event/bundle
  let referralRewardAmount = 0;
  try {
    if (booking.bundleId) {
      const bundle = await EventBundle.findById(booking.bundleId).select("referralRewardAmount").lean();
      referralRewardAmount = bundle?.referralRewardAmount || 0;
    } else {
      const event = await Event.findById(booking.eventId).select("referralRewardAmount").lean();
      referralRewardAmount = event?.referralRewardAmount || 0;
    }
  } catch (err) {
    console.error("[Referral] Error fetching event/bundle reward amount:", err.message);
  }

  if (referralRewardAmount <= 0) {
    console.log(`[Referral] referralRewardAmount is 0 for booking ${booking._id}. Skipping reward.`);
    return null;
  }

  try {
    const rewardData = {
      referredBookingId: booking._id,
      rewardAmount: referralRewardAmount,
      discountPercent: 0,
      status: "used", // Cash is credited straight into the wallet.
    };

    // Store/repair the reward record before crediting the wallet. This makes
    // concurrent webhook deliveries safe: a legacy process may create a
    // zero-value percentage row first, but it can never leave the UI showing
    // $0 after the cash credit succeeds.
    let reward = existingReward;
    if (reward && Number(reward.rewardAmount || 0) <= 0) {
      reward.set(rewardData);
      await reward.save();
    } else if (!reward) {
      try {
        reward = await ReferralReward.create({
          referrerUserId: referrer._id,
          referredEmail: booking.buyerEmail.toLowerCase(),
          ...rewardData,
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
        // A parallel delivery won the unique key race. Upgrade its legacy
        // record instead of crediting a second time.
        reward = await ReferralReward.findOne({
          referrerUserId: referrer._id,
          referredEmail: booking.buyerEmail.toLowerCase(),
        });
        if (!reward) throw err;
        if (Number(reward.rewardAmount || 0) <= 0) {
          reward.set(rewardData);
          await reward.save();
        }
      }
    }

    // A booking can reach confirmation via both the Stripe webhook and the
    // success page. The wallet ledger is the final idempotency check, so a
    // confirmed cash reward is never credited twice.
    const creditedAlready = await WalletTransaction.exists({
      userId: referrer._id,
      type: "referral",
      bookingId: booking._id,
    });
    if (creditedAlready) {
      if (!reward.walletCreditedAt) {
        reward.walletCreditedAt = new Date();
        await reward.save();
      }
      console.log(`[Referral] Reward already credited for booking ${booking._id}. Skipping wallet credit.`);
      await notifyRewardEarned(referrer._id, reward, {
        name: booking.buyerName,
        email: booking.buyerEmail,
        isBundleBooking: booking.isBundleBooking,
        bundleName: booking.bundleName,
        eventName: booking.eventName,
      });
      return reward;
    }

    // Claim the cash payout atomically. Without this, two webhook endpoints
    // can both see the same uncredited reward and credit the wallet twice.
    const claimedAt = new Date();
    const payoutClaim = await ReferralReward.findOneAndUpdate(
      { _id: reward._id, walletCreditedAt: null },
      { $set: { walletCreditedAt: claimedAt } },
      { new: true }
    );
    if (!payoutClaim) {
      console.log(`[Referral] Wallet payout is already being handled for booking ${booking._id}.`);
      // Another endpoint owns the wallet credit, but this local process may
      // own the buyer's live Socket.IO connection. Re-requesting the
      // idempotent inbox alert lets notification.service emit the same record
      // here without creating a duplicate document.
      await notifyRewardEarned(referrer._id, reward, {
        name: booking.buyerName,
        email: booking.buyerEmail,
        isBundleBooking: booking.isBundleBooking,
        bundleName: booking.bundleName,
        eventName: booking.eventName,
      });
      return reward;
    }

    try {
      await walletService.credit(
        referrer._id,
        referralRewardAmount,
        booking.isBundleBooking
          ? `Referral reward: friend (${booking.buyerEmail}) booked bundle "${booking.bundleName || "Bundle"}"`
          : `Referral reward: friend (${booking.buyerEmail}) booked event "${booking.eventName || "Event"}"`,
        { type: "referral", bookingId: booking._id }
      );
    } catch (creditError) {
      // Do not permanently lock a reward if the wallet ledger write fails.
      await ReferralReward.updateOne(
        { _id: reward._id, walletCreditedAt: claimedAt },
        { $set: { walletCreditedAt: null } }
      );
      throw creditError;
    }

    console.log(`[Referral] ✅ Reward created & credited! Referrer ${referrer.email} earns $${referralRewardAmount}. Reward ID: ${reward._id}`);

    await notifyRewardEarned(referrer._id, reward, {
      name: booking.buyerName,
      email: booking.buyerEmail,
      isBundleBooking: booking.isBundleBooking,
      bundleName: booking.bundleName,
      eventName: booking.eventName,
    });

    await notifyPlatformAdmin({
      type: "platform.referral.reward-earned",
      title: "Referral reward earned",
      message: `${booking.buyerName || booking.buyerEmail} earned a $${referralRewardAmount} referral reward for ${referrer.name || referrer.email}.`,
      organizationId: booking.organizationId,
      link: "/platform-admin/activity",
      metadata: { rewardId: String(reward._id), bookingId: String(booking._id), referrerEmail: referrer.email, buyerEmail: booking.buyerEmail, rewardAmount: referralRewardAmount },
      dedupeKey: `platform-referral-reward:${reward._id}`
    });

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

// Some cart/wallet flows persist the referral reward during their database
// transaction and reach the browser confirmation endpoint with a booking that
// is already marked confirmed. This ensures the corresponding inbox event is
// emitted after that confirmation, without issuing a second reward.
async function ensureBookingReferralNotification(booking) {
  if (!booking?._id) return null;
  const reward = await ReferralReward.findOne({ referredBookingId: booking._id });
  if (!reward) return null;
  await notifyRewardEarned(reward.referrerUserId, reward, {
    name: booking.buyerName,
    email: booking.buyerEmail,
  });
  return reward;
}

/**
 * Get user referral stats and available rewards count
 */
async function getReferralStats(userId) {
  const referralCode = await getUserReferralCode(userId);

  const rewards = await ReferralReward.find({
    referrerUserId: userId,
  }).populate("referredBookingId", "eventName isBundleBooking bundleName").sort({ createdAt: -1 });

  const totalEarnedAmount = rewards.reduce((sum, r) => sum + (r.rewardAmount || 0), 0);

  // Recovery guard: if a reward was created while the API was restarting,
  // restore the missed inbox notification.
  const recoveryCutoff = Date.now() - (24 * 60 * 60 * 1000);
  await Promise.all(
    rewards
      .filter((reward) => new Date(reward.createdAt).getTime() >= recoveryCutoff)
      .map((reward) => notifyRewardEarned(userId, reward, {
        email: reward.referredEmail,
        isBundleBooking: reward.referredBookingId?.isBundleBooking,
        bundleName: reward.referredBookingId?.bundleName,
        eventName: reward.referredBookingId?.eventName,
      }))
  );

  return {
    referralCode,
    totalEarnedAmount,
    totalEarnedCount: rewards.length,
    availableRewardsCount: 0, // No longer using percentage discounts
    availableRewards: [],
    usedRewardsHistory: rewards,
  };
}

/**
 * Reserve/calculate referral reward discount for checkout (Stubbed, no discounts)
 */
async function calculateReferralDiscount(userId, rewardsToApply, originalTotal) {
  return {
    rewardsToApplyCount: 0,
    discountPercent: 0,
    discountAmount: 0,
    finalTotal: originalTotal,
    rewardIds: [],
  };
}

/**
 * Mark rewards as used after payment confirmation (Stubbed, processed on earn)
 */
async function consumeReferralRewards(userId, rewardsCount, bookingId) {
  console.log(`[ReferralService] consumeReferralRewards stub invoked for userId = ${userId}, bookingId = ${bookingId}`);
  return;
}

module.exports = {
  getUserReferralCode,
  processBookingReferral,
  ensureBookingReferralNotification,
  getReferralStats,
  calculateReferralDiscount,
  consumeReferralRewards,
};
