const Notification = require("../models/Notification");
const OrganizationMember = require("../models/OrganizationMember");

const visibleFilter = async (userId) => {
  const memberships = await OrganizationMember.find({ userId }).select("organizationId").lean();
  const organizationIds = memberships.map((member) => member.organizationId);
  return {
    recipientUserId: userId,
    dismissedAt: null,
    $or: [{ scope: "personal" }, { scope: "organization", organizationId: { $in: organizationIds } }],
  };
};

exports.list = async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = await visibleFilter(req.user._id);
    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter).populate("organizationId", "name slug").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, readAt: null }),
    ]);
    const hydrated = notifications.map((notification) => {
      // Backfill old booking notifications created before direct-detail links
      // were introduced, without mutating their audit record.
      if (notification.type === "booking.confirmed" && notification.scope === "organization" && notification.metadata?.bookingId && notification.organizationId?.slug) {
        return { ...notification, link: `/o/${notification.organizationId.slug}/manage/booking-lookup?bookingId=${notification.metadata.bookingId}` };
      }
      return notification;
    });
    res.json({ notifications: hydrated, page, limit, total, unread, hasMore: page * limit < total });
  } catch (error) { next(error); }
};

exports.markRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate({ _id: req.params.notificationId, ...(await visibleFilter(req.user._id)) }, { $set: { readAt: new Date() } }, { new: true });
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json({ notification });
  } catch (error) { next(error); }
};

exports.dismiss = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate({ _id: req.params.notificationId, ...(await visibleFilter(req.user._id)) }, { $set: { dismissedAt: new Date(), readAt: new Date() } }, { new: true });
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json({ success: true });
  } catch (error) { next(error); }
};

exports.markAllRead = async (req, res, next) => {
  try { await Notification.updateMany(await visibleFilter(req.user._id), { $set: { readAt: new Date() } }); res.json({ success: true }); } catch (error) { next(error); }
};

exports.dismissAll = async (req, res, next) => {
  try { await Notification.updateMany(await visibleFilter(req.user._id), { $set: { dismissedAt: new Date(), readAt: new Date() } }); res.json({ success: true }); } catch (error) { next(error); }
};
