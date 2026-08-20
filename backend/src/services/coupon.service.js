const Coupon = require("../models/Coupon");
const mongoose = require("mongoose");

// Prices in StagePass are stored as USD amounts (for example 5.00), not
// integer cents. Never round a percentage discount to a whole dollar: 5% of
// $5.00 is a valid $0.25 discount, not $0.00.
const roundCurrency = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100) / 100;

/**
 * Create a new coupon for an organization
 */
async function createCoupon(organizationId, data) {
  const { code, discountType, discountValue, eventId, bundleId, expiresAt, maxUses } = data;

  if (!code || !discountValue) {
    const error = new Error("Coupon code and discount value are required");
    error.statusCode = 400;
    throw error;
  }

  const cleanCode = String(code).trim().toUpperCase();

  // Validate discount value
  if (discountType === "percentage" && (discountValue <= 0 || discountValue > 100)) {
    const error = new Error("Percentage discount must be between 1 and 100");
    error.statusCode = 400;
    throw error;
  }

  if (discountType === "fixed" && discountValue <= 0) {
    const error = new Error("Fixed discount must be greater than 0");
    error.statusCode = 400;
    throw error;
  }

  // Check if coupon code already exists in this organization
  const existing = await Coupon.findOne({ organizationId, code: cleanCode });
  if (existing) {
    const error = new Error(`Coupon with code ${cleanCode} already exists in this organization`);
    error.statusCode = 409;
    throw error;
  }

  const coupon = await Coupon.create({
    organizationId,
    code: cleanCode,
    discountType: discountType || "percentage",
    discountValue,
    eventId: eventId ? new mongoose.Types.ObjectId(eventId) : null,
    bundleId: bundleId ? new mongoose.Types.ObjectId(bundleId) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    maxUses: maxUses ? parseInt(maxUses, 10) : null,
  });

  return coupon;
}

/**
 * List all coupons for an organization
 */
async function listCoupons(organizationId) {
  return Coupon.find({ organizationId }).sort({ createdAt: -1 });
}

/**
 * Delete a coupon from an organization
 */
async function deleteCoupon(organizationId, couponId) {
  const result = await Coupon.findOneAndDelete({ _id: couponId, organizationId });
  if (!result) {
    const error = new Error("Coupon not found");
    error.statusCode = 404;
    throw error;
  }
  return { success: true, message: "Coupon deleted successfully" };
}

/**
 * Validate a coupon code and calculate the discount for a checkout
 */
async function validateAndApplyCoupon(organizationId, code, originalTotal, context = {}) {
  const { eventId, bundleId } = context;
  if (!code) {
    const error = new Error("Coupon code is required");
    error.statusCode = 400;
    throw error;
  }

  const cleanCode = String(code).trim().toUpperCase();

  const coupon = await Coupon.findOne({ organizationId, code: cleanCode });

  if (!coupon) {
    const error = new Error(`Coupon code '${cleanCode}' is invalid or does not exist`);
    error.statusCode = 404;
    throw error;
  }

  if (!coupon.isActive) {
    const error = new Error(`Coupon code '${cleanCode}' is no longer active`);
    error.statusCode = 400;
    throw error;
  }

  // Expiration date validation
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    const error = new Error(`Coupon code '${cleanCode}' has expired`);
    error.statusCode = 400;
    throw error;
  }

  // Usage limit validation
  if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
    const error = new Error(`Coupon code '${cleanCode}' has reached its maximum usage limit`);
    error.statusCode = 400;
    throw error;
  }

  // Event scoping validation
  if (coupon.eventId) {
    if (!eventId || String(coupon.eventId) !== String(eventId)) {
      if (!coupon.bundleId || !bundleId || String(coupon.bundleId) !== String(bundleId)) {
        const error = new Error(`Coupon code '${cleanCode}' is not valid for this purchase`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // Bundle scoping validation
  if (coupon.bundleId) {
    if (!bundleId || String(coupon.bundleId) !== String(bundleId)) {
      if (!coupon.eventId || !eventId || String(coupon.eventId) !== String(eventId)) {
        const error = new Error(`Coupon code '${cleanCode}' is not valid for this purchase`);
        error.statusCode = 400;
        throw error;
      }
    }
  }

  // Calculate discount amount
  let discountAmount = 0;
  if (coupon.discountType === "percentage") {
    discountAmount = roundCurrency((Number(originalTotal) * Number(coupon.discountValue)) / 100);
  } else if (coupon.discountType === "fixed") {
    discountAmount = roundCurrency(coupon.discountValue);
  }

  // Cap discount at total amount (avoid negative amount due)
  discountAmount = Math.min(discountAmount, originalTotal);
  const finalTotal = Math.max(0, originalTotal - discountAmount);

  return {
    valid: true,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount,
    finalTotal,
  };
}

// Calculates one pasted code across independent cart targets. A bundle is one
// target; its child event bookings are never eligible for an event-only coupon.
async function calculateCartCouponDiscounts(purchases, code) {
  if (!code || !String(code).trim() || !purchases.length) {
    return { totalDiscount: 0, discountsByKey: {}, codesByKey: {}, appliedCount: 0 };
  }
  const cleanCode = String(code).trim().toUpperCase();
  const organizationIds = [...new Set(purchases.map((item) => String(item.organizationId)))];
  const coupons = await Coupon.find({ organizationId: { $in: organizationIds }, code: cleanCode }).lean();
  const now = new Date();
  const couponByOrg = new Map(coupons.map((coupon) => [String(coupon.organizationId), coupon]));
  const groups = new Map();

  purchases.forEach((purchase) => {
    const groupKey = purchase.bundleId ? `bundle:${purchase.bundleId}` : `item:${purchase.key}`;
    if (!groups.has(groupKey)) groups.set(groupKey, { purchases: [], amount: 0 });
    const group = groups.get(groupKey);
    group.purchases.push(purchase);
    group.amount += Number(purchase.amount || 0);
  });

  const discountsByKey = {};
  const codesByKey = {};
  let totalDiscount = 0;
  let appliedCount = 0;
  for (const group of groups.values()) {
    const first = group.purchases[0];
    const coupon = couponByOrg.get(String(first.organizationId));
    if (!coupon || !coupon.isActive || (coupon.expiresAt && new Date(coupon.expiresAt) < now) || (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses)) continue;

    const matchesBundle = first.bundleId && coupon.bundleId && String(coupon.bundleId) === String(first.bundleId);
    const matchesEvent = !first.bundleId && coupon.eventId && String(coupon.eventId) === String(first.eventId);
    const isOrgWide = !coupon.eventId && !coupon.bundleId;
    if (!matchesBundle && !matchesEvent && !isOrgWide) continue;

    const groupDiscount = Math.min(
      group.amount,
      coupon.discountType === "percentage"
        ? roundCurrency((group.amount * Number(coupon.discountValue)) / 100)
        : roundCurrency(coupon.discountValue),
    );
    if (!groupDiscount) continue;
    appliedCount += 1;
    totalDiscount += groupDiscount;
    group.purchases.forEach((purchase, index) => {
      const isLast = index === group.purchases.length - 1;
      const allocated = isLast
        ? Math.max(0, groupDiscount - group.purchases.slice(0, index).reduce((sum, item) => sum + (discountsByKey[item.key] || 0), 0))
        : Math.round((groupDiscount * Number(purchase.amount || 0) / group.amount) * 100) / 100;
      discountsByKey[purchase.key] = allocated;
      codesByKey[purchase.key] = coupon.code;
    });
  }
  return { totalDiscount, discountsByKey, codesByKey, appliedCount };
}

/**
 * Increment usage counter for a coupon upon confirmed payment
 */
async function incrementCouponUses(organizationId, code) {
  if (!code) return;

  const cleanCode = String(code).trim().toUpperCase();
  await Coupon.updateOne(
    { organizationId, code: cleanCode },
    { $inc: { usedCount: 1 } }
  );
}

async function updateCoupon(organizationId, couponId, data) {
  const { code, discountType, discountValue, eventId, bundleId, expiresAt, maxUses } = data;

  const coupon = await Coupon.findOne({ _id: couponId, organizationId });
  if (!coupon) {
    const error = new Error("Coupon not found");
    error.statusCode = 404;
    throw error;
  }

  // Validate discount value
  if (discountType === "percentage" && (discountValue <= 0 || discountValue > 100)) {
    const error = new Error("Percentage discount must be between 1 and 100");
    error.statusCode = 400;
    throw error;
  }

  if (discountType === "fixed" && discountValue <= 0) {
    const error = new Error("Fixed discount must be greater than 0");
    error.statusCode = 400;
    throw error;
  }

  if (code) {
    const cleanCode = String(code).trim().toUpperCase();
    const existing = await Coupon.findOne({ organizationId, code: cleanCode, _id: { $ne: couponId } });
    if (existing) {
      const error = new Error(`Coupon with code ${cleanCode} already exists in this organization`);
      error.statusCode = 409;
      throw error;
    }
    coupon.code = cleanCode;
  }

  if (discountType !== undefined) coupon.discountType = discountType;
  if (discountValue !== undefined) coupon.discountValue = discountValue;
  
  if (eventId !== undefined) {
    coupon.eventId = eventId ? new mongoose.Types.ObjectId(eventId) : null;
  }

  if (bundleId !== undefined) {
    coupon.bundleId = bundleId ? new mongoose.Types.ObjectId(bundleId) : null;
  }
  
  if (expiresAt !== undefined) {
    coupon.expiresAt = expiresAt ? new Date(expiresAt) : null;
  }
  
  if (maxUses !== undefined) {
    coupon.maxUses = maxUses ? parseInt(maxUses, 10) : null;
  }

  await coupon.save();
  return coupon;
}

module.exports = {
  createCoupon,
  listCoupons,
  deleteCoupon,
  updateCoupon,
  validateAndApplyCoupon,
  calculateCartCouponDiscounts,
  incrementCouponUses,
};
