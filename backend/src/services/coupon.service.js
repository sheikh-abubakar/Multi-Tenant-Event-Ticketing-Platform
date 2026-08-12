const Coupon = require("../models/Coupon");
const mongoose = require("mongoose");

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
    discountAmount = Math.round((originalTotal * coupon.discountValue) / 100);
  } else if (coupon.discountType === "fixed") {
    discountAmount = Math.round(coupon.discountValue);
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
  incrementCouponUses,
};
