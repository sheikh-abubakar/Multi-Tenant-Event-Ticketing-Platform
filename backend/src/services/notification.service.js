const Notification = require("../models/Notification");
const OrganizationMember = require("../models/OrganizationMember");
const User = require("../models/User");
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
    if (error?.code === 11000 && payload.dedupeKey) {
      // A Stripe test event can legitimately be delivered to both the local
      // CLI listener and the deployed webhook endpoint. The first process
      // persists the document; a second process must not create another one,
      // but it still needs to push that same persisted alert to its own
      // connected Socket.IO clients. This keeps the inbox exactly-once while
      // preserving live delivery across those processes.
      // Refresh the business-facing content without changing read/dismiss
      // state. This also upgrades a legacy 10%-discount referral message to
      // the current cash-reward wording when both deployments saw the event.
      const existing = await Notification.findOneAndUpdate(
        {
          recipientUserId: payload.recipientUserId,
          dedupeKey: payload.dedupeKey,
        },
        {
          $set: {
            title: payload.title,
            message: payload.message,
            link: payload.link || null,
            metadata: payload.metadata || {},
            organizationId: payload.organizationId || null,
            scope: payload.scope,
            type: payload.type,
          },
        },
        { new: true }
      ).lean();
      if (existing) {
        emitNotificationToUser(payload.recipientUserId, existing);
        return existing;
      }
      return null;
    }
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
    const results = await Promise.all(recipientIds.map((recipientUserId) => safeCreate({
      recipientUserId,
      organizationId,
      scope: "organization",
      ...data,
    })));
    if (data.platformNotify !== false) {
      await notifyPlatformAdmin({
        type: `platform.${data.type || "organization.activity"}`,
        title: data.title || "Organization activity",
        message: data.message || "An organization activity was completed.",
        organizationId,
        link: `/platform-admin/organizations/${organizationId}`,
        metadata: { ...(data.metadata || {}), sourceType: data.type || "organization.activity" },
        dedupeKey: data.dedupeKey ? `platform:${data.dedupeKey}` : undefined,
      });
    }
    return results;
  } catch (error) {
    logger.error("Organization notification creation failed", { error: error.message, organizationId: String(organizationId) });
    return [];
  }
};

// Platform alerts are always personal notifications for the platform control
// account. Keeping them outside tenant membership scope prevents an
// organization user from ever reading cross-platform activity.
const notifyPlatformAdmin = async (data) => {
  try {
    const admin = await User.findOne({ platformRole: "super_admin" }).select("_id").lean();
    if (!admin) {
      logger.warn("Platform notification skipped: no super admin account found", { type: data?.type });
      return null;
    }
    return safeCreate({ recipientUserId: admin._id, scope: "personal", ...data });
  } catch (error) {
    logger.error("Platform notification creation failed", { error: error.message, type: data?.type });
    return null;
  }
};

module.exports = { notifyUser, notifyOrganization, notifyPlatformAdmin };
