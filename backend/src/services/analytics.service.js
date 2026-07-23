const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Event = require("../models/Event");
const Venue = require("../models/Venue");

/**
 * Analytics service — all queries are tenant-scoped by organizationId.
 * Every function below filters by organizationId in the query itself,
 * never fetch-then-check (see §4.2 in TECHNICAL_DOCUMENTATION.md).
 */

/**
 * Get a comprehensive analytics payload for the owner dashboard.
 * All metrics are scoped to a single organization.
 */
const getOwnerAnalytics = async (organizationId) => {
  const orgId = new mongoose.Types.ObjectId(organizationId);

  // ── 1. Core metrics (Promise.all for parallel execution) ──────
  const [
    totalBookingsResult,
    totalRevenueResult,
    totalTicketsResult,
    eventsCountResult,
    venuesCountResult,
    bookingsPerEvent,
    recentBookings,
    revenueByDay,
    refundsByDay,
    refundStats,
    refundsByEvent,
  ] = await Promise.all([
    // Total confirmed bookings
    Booking.countDocuments({ organizationId: orgId, status: "confirmed" }),

    // Total revenue from confirmed bookings
    Booking.aggregate([
      { $match: { organizationId: orgId, status: "confirmed" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),

    // Total tickets sold (sum of all items.quantity in confirmed bookings)
    Booking.aggregate([
      { $match: { organizationId: orgId, status: "confirmed" } },
      { $unwind: "$items" },
      { $group: { _id: null, total: { $sum: "$items.quantity" } } },
    ]),

    // Total events
    Event.countDocuments({ organizationId: orgId }),

    // Total venues
    Venue.countDocuments({ organizationId: orgId }),

    // Bookings per event (for bar chart)
    Booking.aggregate([
      { $match: { organizationId: orgId, status: "confirmed" } },
      { $group: { _id: "$eventId", count: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } },
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          eventId: "$event._id",
          eventName: "$event.name",
          dateTime: "$event.dateTime",
          count: 1,
          revenue: 1,
        },
      },
    ]),

    // Recent completed/refunded bookings. A refund is business activity and
    // must remain visible to organizers instead of disappearing from history.
    Booking.find({ organizationId: orgId, status: { $in: ["confirmed", "refunded"] } })
      .populate("eventId", "name dateTime")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    // Revenue for last 30 days (for line/bar chart)
    Booking.aggregate([
      {
        $match: {
          organizationId: orgId,
          status: "confirmed",
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$totalAmount" },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: "$_id",
          revenue: 1,
          bookings: 1,
        },
      },
    ]),

    // Refund trend for the same 30-day reporting window.
    Booking.aggregate([
      { $match: { organizationId: orgId, status: "refunded", "refundInfo.processedAt": { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$refundInfo.processedAt" } }, refunds: { $sum: 1 }, refundedAmount: { $sum: "$refundInfo.amount" } } },
      { $project: { _id: 0, date: "$_id", refunds: 1, refundedAmount: 1 } },
    ]),

    // Refund stats
    Booking.aggregate([
      { $match: { organizationId: orgId, status: "refunded" } },
      {
        $group: {
          _id: null,
          totalRefunds: { $sum: 1 },
          totalRefundedAmount: { $sum: "$refundInfo.amount" },
          totalDeduction: { $sum: "$refundInfo.deduction" },
          totalOrgRevenue: { $sum: "$refundInfo.organizationRevenue" },
        },
      },
    ]),

    // Refunds by event
    Booking.aggregate([
      { $match: { organizationId: orgId, status: "refunded" } },
      {
        $group: {
          _id: "$eventId",
          refundCount: { $sum: 1 },
          refundedAmount: { $sum: "$refundInfo.amount" },
          orgRevenue: { $sum: "$refundInfo.organizationRevenue" },
        },
      },
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },
      { $sort: { refundCount: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          eventId: "$event._id",
          eventName: "$event.name",
          refundCount: 1,
          refundedAmount: 1,
          orgRevenue: 1,
        },
      },
    ]),
  ]);

  // ── 2. Shape the response ─────────────────────────────────────

  const totalRevenue = totalRevenueResult[0]?.total || 0;
  const totalTicketsSold = totalTicketsResult[0]?.total || 0;

  const refundStatsResult = refundStats[0] || {};
  const totalRefunds = refundStatsResult.totalRefunds || 0;
  const totalRefundedAmount = refundStatsResult.totalRefundedAmount || 0;
  const totalDeduction = refundStatsResult.totalDeduction || 0;
  const totalOrgRevenue = refundStatsResult.totalOrgRevenue || 0;

  // Net revenue = revenue from confirmed ticket sales + the 10% the org
  // keeps whenever a buyer takes a direct Stripe refund (refunded
  // bookings are excluded from `totalRevenue` above since their tickets
  // were returned, but the org still earned that 10% cut for processing
  // the refund — that's real revenue and should count toward the total).
  // Wallet refunds contribute 0 here since they're a 100% refund with no
  // org cut (see refund.service.js#processWalletRefund).
  const netRevenue = totalRevenue + totalOrgRevenue;

  // Fill in missing days in revenueByDay with zeroes
  const revenueMap = {};
  revenueByDay.forEach((d) => {
    revenueMap[d.date] = { revenue: d.revenue, bookings: d.bookings };
  });
  const refundMap = Object.fromEntries(refundsByDay.map((d) => [d.date, d]));

  const filledRevenueByDay = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    filledRevenueByDay.push({
      date: dateStr,
      revenue: revenueMap[dateStr]?.revenue || 0,
      bookings: revenueMap[dateStr]?.bookings || 0,
      refunds: refundMap[dateStr]?.refunds || 0,
      refundedAmount: refundMap[dateStr]?.refundedAmount || 0,
      netRevenue: (revenueMap[dateStr]?.revenue || 0) - (refundMap[dateStr]?.refundedAmount || 0),
    });
  }

  // Shape recent bookings
  const shapedRecentBookings = recentBookings.map((b) => ({
    id: b._id,
    buyerName: b.buyerName,
    buyerEmail: b.buyerEmail,
    // Prefer the snapshot saved at booking time — falls back to the
    // live populated event only for older bookings created before this
    // snapshot existed. This is why "Unknown" can still show up for
    // bookings made before this fix; new bookings will always have it.
    eventName: b.eventName || b.eventId?.name || "Unknown",
    eventDate: b.eventDateTime || b.eventId?.dateTime || null,
    totalAmount: b.totalAmount,
    originalAmount: b.originalAmount || b.totalAmount,
    status: b.status,
    paymentStatus: b.paymentStatus,
    refundInfo: b.refundInfo || null,
    createdAt: b.createdAt,
  }));

  return {
    metrics: {
      totalBookings: totalBookingsResult,
      totalRevenue,
      netRevenue,
      totalTicketsSold: totalTicketsSold,
      totalEvents: eventsCountResult,
      totalVenues: venuesCountResult,
      totalRefunds,
      totalRefundedAmount,
      totalDeduction,
      totalOrgRevenue,
    },
    bookingsPerEvent,
    recentBookings: shapedRecentBookings,
    revenueByDay: filledRevenueByDay,
    refundsByEvent,
  };
};

module.exports = { getOwnerAnalytics };
