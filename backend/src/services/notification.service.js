const Notification = require("../models/Notification");
const OrganizationMember = require("../models/OrganizationMember");
const { emitNotificationToUser } = require("./realtime.service");
const { logger } = require("../config/logger");

const safeCreate = async (payload) => {
  try {
    // Never persist `dedupeKey: null` / `undefined`: the sparse unique index
    // must only participate for notifications that intentionally opt in to
    // idempotency (webhook/browser retry flows).
    const document = { ...payload };
    if (!document.dedupeKey) delete document.dedupeKey;
    const notification = await Notification.create(document);
    logger.info("Notification created", {
      notificationId: notification._id.toString(), recipientUserId: String(payload.recipientUserId),
      organizationId: payload.organizationId ? String(payload.organizationId) : undefined, type: payload.type,
    });
    emitNotificationToUser(payload.recipientUserId, notification.toObject());
    return notification;
  } catch (error) {
    // Duplicate-key is an expected result of retry-safe workflows (Stripe
    // webhook + success-page confirmation). It is not an application error.
    if (error?.code === 11000 && payload.dedupeKey) return null;
    // Notifications must never break a payment, booking or management action.
    logger.error("Notification creation failed", { error: error.message, type: payload.type });
    return null;
  }
};

const notifyUser = (recipientUserId, data) => recipientUserId && safeCreate({
  recipientUserId,
  scope: "personal",
  ...data,
});

const notifyOrganization = async (organizationId, data, actorUserId = null) => {
  if (!organizationId) return [];
  try {
    const members = await OrganizationMember.find({ organizationId }).select("userId").lean();
    const recipientIds = [...new Set(members.map((member) => String(member.userId)))]
      .filter((id) => id !== String(actorUserId || ""));
    return Promise.all(recipientIds.map((recipientUserId) => safeCreate({
      recipientUserId,
      organizationId,
      scope: "organization",
      ...data,
    })));
  } catch (error) {
    logger.error("Organization notification creation failed", { error: error.message, organizationId: String(organizationId) });
    return [];
  }
};

module.exports = { notifyUser, notifyOrganization };
