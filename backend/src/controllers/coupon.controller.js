const couponService = require("../services/coupon.service");
const { notifyOrganization } = require("../services/notification.service");

/**
 * Create a new coupon (requires settings:update or events:create permission)
 */
const create = async (req, res) => {
  try {
    const coupon = await couponService.createCoupon(req.organizationId, req.body);
    await notifyOrganization(req.organizationId, { type: "coupon.created", title: "Coupon created", message: `${req.user.name || req.user.email} created coupon ${coupon.code}.`, link: `/o/${req.params.orgSlug}/manage/coupons`, metadata: { couponId: String(coupon._id) } }, req.user._id);
    return res.status(201).json({
      status: "success",
      data: coupon,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message,
    });
  }
};

/**
 * List all coupons for the organization
 */
const list = async (req, res) => {
  try {
    const coupons = await couponService.listCoupons(req.organizationId);
    return res.json({
      status: "success",
      data: coupons,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message,
    });
  }
};

/**
 * Delete a coupon
 */
const remove = async (req, res) => {
  try {
    const result = await couponService.deleteCoupon(req.organizationId, req.params.couponId);
    await notifyOrganization(req.organizationId, { type: "coupon.deleted", title: "Coupon removed", message: `${req.user.name || req.user.email} removed a coupon.`, link: `/o/${req.params.orgSlug}/manage/coupons`, metadata: { couponId: req.params.couponId } }, req.user._id);
    return res.json({
      status: "success",
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message,
    });
  }
};

/**
 * Validate a coupon code during checkout (public)
 */
const validate = async (req, res) => {
  try {
    const { code, originalTotal, eventId: bodyEventId, bundleId } = req.body;
    const targetEventId = bodyEventId || req.params.eventId;

    if (!code || originalTotal === undefined) {
      return res.status(400).json({
        status: "error",
        message: "code and originalTotal are required",
      });
    }

    const result = await couponService.validateAndApplyCoupon(
      req.organizationId,
      code,
      Number(originalTotal),
      { eventId: targetEventId, bundleId }
    );

    return res.json({
      status: "success",
      data: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      status: "error",
      message: error.message,
    });
  }
};

const update = async (req, res) => {
  try {
    const coupon = await couponService.updateCoupon(req.organizationId, req.params.couponId, req.body);
    await notifyOrganization(req.organizationId, { type: "coupon.updated", title: "Coupon updated", message: `${req.user.name || req.user.email} updated coupon ${coupon.code}.`, link: `/o/${req.params.orgSlug}/manage/coupons`, metadata: { couponId: String(coupon._id) } }, req.user._id);
    return res.json({
      status: "success",
      data: coupon,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      status: "error",
      message: error.message,
    });
  }
};

module.exports = {
  create,
  list,
  remove,
  update,
  validate,
};
