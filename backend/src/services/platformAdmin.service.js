const mongoose = require("mongoose");
const User = require("../models/User");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");
const Event = require("../models/Event");
const Booking = require("../models/Booking");
const PlatformAuditLog = require("../models/PlatformAuditLog");
const { recordPlatformAudit } = require("../utils/platformAudit");
const { notifyPlatformAdmin } = require("./notification.service");

const getRangeStart = (range = "30d") => {
  if (range === "all") return null;
  const days = { "7d": 7, "30d": 30, "90d": 90 }[range] || 30;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
};

const bookingMatch = (start) => ({ status: "confirmed", ...(start ? { createdAt: { $gte: start } } : {}) });
const ticketExpression = {
  $add: [
    { $reduce: { input: { $ifNull: ["$items", []] }, initialValue: 0, in: { $add: ["$$value", { $ifNull: ["$$this.quantity", 0] }] } } },
    { $size: { $ifNull: ["$selectedSeats", []] } },
  ],
};

const getOverview = async (range) => {
  const start = getRangeStart(range);
  const match = bookingMatch(start);
  const today = new Date();

  const [organizations, users, events, bookingTotals, refunds, trendRows, topOrganizations, bookingStatus, activity, upcomingEvents] = await Promise.all([
    Organization.aggregate([{ $group: { _id: null, total: { $sum: { $cond: [{ $ne: ["$isDeleted", true] }, 1, 0] } }, active: { $sum: { $cond: [{ $and: [{ $ne: ["$isDeleted", true] }, { $ne: ["$isSuspended", true] }] }, 1, 0] } }, suspended: { $sum: { $cond: [{ $and: [{ $ne: ["$isDeleted", true] }, { $eq: ["$isSuspended", true] }] }, 1, 0] } } } }]),
    User.countDocuments({}),
    Event.aggregate([{ $group: { _id: null, total: { $sum: 1 }, upcoming: { $sum: { $cond: [{ $gte: ["$dateTime", today] }, 1, 0] } } } }]),
    Booking.aggregate([{ $match: match }, { $project: { totalAmount: 1, ticketCount: ticketExpression } }, { $group: { _id: null, bookings: { $sum: 1 }, revenue: { $sum: "$totalAmount" }, tickets: { $sum: "$ticketCount" } } }]),
    Booking.aggregate([{ $match: { status: "refunded", ...(start ? { "refundInfo.processedAt": { $gte: start } } : {}) } }, { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: "$refundInfo.amount" } } }]),
    Booking.aggregate([{ $match: match }, { $project: { totalAmount: 1, ticketCount: ticketExpression, createdAt: 1 } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$totalAmount" }, bookings: { $sum: 1 }, tickets: { $sum: "$ticketCount" } } }, { $sort: { _id: 1 } }]),
    Booking.aggregate([{ $match: match }, { $project: { organizationId: 1, totalAmount: 1, ticketCount: ticketExpression } }, { $group: { _id: "$organizationId", revenue: { $sum: "$totalAmount" }, bookings: { $sum: 1 }, tickets: { $sum: "$ticketCount" } } }, { $sort: { revenue: -1 } }, { $limit: 8 }, { $lookup: { from: "organizations", localField: "_id", foreignField: "_id", as: "organization" } }, { $unwind: "$organization" }, { $project: { _id: 0, organizationId: "$_id", name: "$organization.name", slug: "$organization.slug", revenue: 1, bookings: 1, tickets: 1 } }]),
    Booking.aggregate([{ $match: { ...(start ? { createdAt: { $gte: start } } : {}) } }, { $group: { _id: "$status", value: { $sum: 1 } } }, { $project: { _id: 0, name: "$_id", value: 1 } }]),
    PlatformAuditLog.find({}).sort({ createdAt: -1 }).limit(12).populate("actorUserId", "name email").populate("organizationId", "name slug").lean(),
    Event.find({ dateTime: { $gte: today }, organizationId: { $exists: true } }).sort({ dateTime: 1 }).limit(5).populate("organizationId", "name slug").lean(),
  ]);

  const trendMap = Object.fromEntries(trendRows.map((row) => [row._id, row]));
  const days = range === "all" ? trendRows.map((row) => row._id) : Array.from({ length: { "7d": 7, "30d": 30, "90d": 90 }[range] || 30 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (({ "7d": 7, "30d": 30, "90d": 90 }[range] || 30) - 1 - index)); return date.toISOString().slice(0, 10);
  });

  return {
    metrics: {
      totalOrganizations: organizations[0]?.total || 0,
      activeOrganizations: organizations[0]?.active || 0,
      suspendedOrganizations: organizations[0]?.suspended || 0,
      totalUsers: users,
      totalEvents: events[0]?.total || 0,
      upcomingEvents: events[0]?.upcoming || 0,
      totalBookings: bookingTotals[0]?.bookings || 0,
      ticketsSold: bookingTotals[0]?.tickets || 0,
      grossSales: bookingTotals[0]?.revenue || 0,
      refunds: refunds[0]?.count || 0,
      refundedAmount: refunds[0]?.amount || 0,
      netSales: (bookingTotals[0]?.revenue || 0) - (refunds[0]?.amount || 0),
    },
    trend: days.map((date) => ({ date, revenue: trendMap[date]?.revenue || 0, bookings: trendMap[date]?.bookings || 0, tickets: trendMap[date]?.tickets || 0 })),
    topOrganizations,
    bookingStatus,
    activity: activity.map((item) => ({ id: item._id, action: item.action, metadata: item.metadata, createdAt: item.createdAt, actor: item.actorUserId ? { name: item.actorUserId.name, email: item.actorUserId.email } : null, organization: item.organizationId ? { name: item.organizationId.name, slug: item.organizationId.slug } : null })),
    upcomingEvents: upcomingEvents.map((event) => ({ id: event._id, name: event.name, dateTime: event.dateTime, organization: event.organizationId ? { name: event.organizationId.name, slug: event.organizationId.slug } : null })),
  };
};

const listOrganizations = async ({ search = "", status = "all", page = 1, limit = 12 }) => {
  const match = { isDeleted: { $ne: true } };
  if (status === "active") match.isSuspended = { $ne: true };
  if (status === "suspended") match.isSuspended = true;
  if (search) match.$or = [{ name: { $regex: search, $options: "i" } }, { slug: { $regex: search, $options: "i" } }];
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const [result, count] = await Promise.all([
    Organization.aggregate([
      { $match: match },
      { $lookup: { from: "organizationmembers", localField: "_id", foreignField: "organizationId", as: "members" } },
      { $lookup: { from: "events", localField: "_id", foreignField: "organizationId", as: "events" } },
      {
        $lookup: {
          from: "bookings",
          let: { organizationId: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [{ $eq: ["$organizationId", "$$organizationId"] }, { $eq: ["$status", "confirmed"] }] } } },
            { $group: { _id: null, bookings: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
          ],
          as: "sales",
        },
      },
      { $project: { name: 1, slug: 1, createdAt: 1, isSuspended: 1, suspendedAt: 1, suspensionReason: 1, memberCount: { $size: "$members" }, eventCount: { $size: "$events" }, bookings: { $ifNull: [{ $arrayElemAt: ["$sales.bookings", 0] }, 0] }, revenue: { $ifNull: [{ $arrayElemAt: ["$sales.revenue", 0] }, 0] } } },
      { $sort: { createdAt: -1 } },
      { $skip: (safePage - 1) * safeLimit },
      { $limit: safeLimit },
    ]),
    Organization.countDocuments(match),
  ]);
  return { organizations: result, pagination: { page: safePage, limit: safeLimit, total: count, pages: Math.max(Math.ceil(count / safeLimit), 1) } };
};

const getOrganizationDetail = async (organizationId, range) => {
  if (!mongoose.isValidObjectId(organizationId)) { const error = new Error("Invalid organization id"); error.statusCode = 400; throw error; }
  const start = getRangeStart(range);
  const organization = await Organization.findById(organizationId).lean();
  if (!organization) { const error = new Error("Organization not found"); error.statusCode = 404; throw error; }
  const [members, events, totals, trendRows, bookings, activity] = await Promise.all([
    OrganizationMember.find({ organizationId }).populate("userId", "name email createdAt").sort({ role: 1, createdAt: 1 }).lean(),
    Event.find({ organizationId }).sort({ dateTime: -1 }).select("name dateTime purchaseMode createdAt").lean(),
    Booking.aggregate([{ $match: { organizationId: new mongoose.Types.ObjectId(organizationId), ...bookingMatch(start) } }, { $project: { totalAmount: 1, ticketCount: ticketExpression } }, { $group: { _id: null, bookings: { $sum: 1 }, revenue: { $sum: "$totalAmount" }, tickets: { $sum: "$ticketCount" } } }]),
    Booking.aggregate([{ $match: { organizationId: new mongoose.Types.ObjectId(organizationId), ...bookingMatch(start) } }, { $project: { totalAmount: 1, ticketCount: ticketExpression, createdAt: 1 } }, { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$totalAmount" }, bookings: { $sum: 1 }, tickets: { $sum: "$ticketCount" } } }, { $sort: { _id: 1 } }]),
    Booking.find({ organizationId, status: { $in: ["confirmed", "refunded"] } }).sort({ createdAt: -1 }).limit(12).select("buyerName buyerEmail eventName totalAmount status paymentStatus createdAt").lean(),
    PlatformAuditLog.find({ organizationId }).sort({ createdAt: -1 }).limit(20).populate("actorUserId", "name email").lean(),
  ]);
  return { organization, members: members.map((member) => ({ id: member._id, role: member.role, createdAt: member.createdAt, user: member.userId ? { name: member.userId.name, email: member.userId.email, createdAt: member.userId.createdAt } : null })), events, metrics: { bookings: totals[0]?.bookings || 0, revenue: totals[0]?.revenue || 0, tickets: totals[0]?.tickets || 0 }, trend: trendRows.map((row) => ({ date: row._id, revenue: row.revenue, bookings: row.bookings, tickets: row.tickets })), bookings: bookings.map((booking) => ({ ...booking, buyerEmail: booking.buyerEmail.replace(/(^.).*(@.*$)/, "$1***$2") })), activity };
};

const setOrganizationStatus = async ({ organizationId, suspended, reason, actorUserId }) => {
  if (!mongoose.isValidObjectId(organizationId)) { const error = new Error("Invalid organization id"); error.statusCode = 400; throw error; }
  if (suspended && !reason?.trim()) { const error = new Error("A suspension reason is required"); error.statusCode = 400; throw error; }
  const organization = await Organization.findByIdAndUpdate(organizationId, { isSuspended: suspended, suspendedAt: suspended ? new Date() : null, suspensionReason: suspended ? reason.trim() : null }, { new: true });
  if (!organization) { const error = new Error("Organization not found"); error.statusCode = 404; throw error; }
  await recordPlatformAudit({ actorUserId, organizationId: organization._id, action: suspended ? "organization.suspended" : "organization.reactivated", targetType: "organization", targetId: organization._id, metadata: { organizationName: organization.name, reason: suspended ? organization.suspensionReason : null } });
  await notifyPlatformAdmin({ type: suspended ? "platform.organization.suspended" : "platform.organization.reactivated", title: suspended ? "Organization suspended" : "Organization reactivated", message: `${organization.name} was ${suspended ? "suspended" : "reactivated"}.`, organizationId: organization._id, link: `/platform-admin/organizations/${organization._id}`, metadata: { organizationId: String(organization._id), reason: suspended ? organization.suspensionReason : null }, dedupeKey: `platform-organization-status:${organization._id}:${suspended}` });
  return organization;
};

const listActivity = async ({ page = 1, limit = 25, action, organizationId }) => {
  const match = { ...(action ? { action } : {}), ...(organizationId && mongoose.isValidObjectId(organizationId) ? { organizationId } : {}) };
  const safePage = Math.max(Number(page) || 1, 1); const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const [items, total] = await Promise.all([PlatformAuditLog.find(match).sort({ createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit).populate("actorUserId", "name email").populate("organizationId", "name slug").lean(), PlatformAuditLog.countDocuments(match)]);
  return { activity: items, pagination: { page: safePage, limit: safeLimit, total, pages: Math.max(Math.ceil(total / safeLimit), 1) } };
};

module.exports = { getOverview, listOrganizations, getOrganizationDetail, setOrganizationStatus, listActivity };
