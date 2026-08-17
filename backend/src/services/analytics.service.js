const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Event = require("../models/Event");
const Venue = require("../models/Venue");
const SeatChangeRequest = require("../models/SeatChangeRequest");

/**
 * Analytics service — all queries are tenant-scoped by organizationId.
 * Every function below filters by organizationId in the query itself,
 * never fetch-then-check (see §4.2 in TECHNICAL_DOCUMENTATION.md).
 */

// ── Simple in-memory cache (TTL = 60 seconds) ──────────────────────────────
// Prevents the 11 aggregation pipelines from running on every page refresh.
// The cache is org-scoped so different orgs never see each other's data.
const analyticsCache = new Map(); // key → { data, expiresAt }
const CACHE_TTL_MS = 60_000; // 60 s

function getCached(key) {
  const entry = analyticsCache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  analyticsCache.delete(key);
  return null;
}

function setCache(key, data) {
  analyticsCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Call this after a ticket verification so the stats refresh immediately. */
const invalidateOrgCache = (organizationId) => {
  analyticsCache.delete(`org:${organizationId}`);
};

/**
 * Get a comprehensive analytics payload for the owner dashboard.
 * All metrics are scoped to a single organization.
 */
const getOwnerAnalytics = async (organizationId) => {
  const cacheKey = `org:${organizationId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

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
    approvedSwapsCount,
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

    // Recent confirmed/refunded bookings — NO populate() here.
    // We use the eventName/eventDateTime snapshot fields stored at booking
    // time so this is a simple index scan with no secondary lookup.
    Booking.find(
      { organizationId: orgId, status: { $in: ["confirmed", "refunded"] } },
      // Only project what the UI actually needs — fewer bytes over the wire
      {
        buyerName: 1, buyerEmail: 1, eventName: 1, eventDateTime: 1,
        eventId: 1, totalAmount: 1, originalAmount: 1, status: 1,
        paymentStatus: 1, refundInfo: 1, verified: 1, verifiedAt: 1, createdAt: 1,
        isBundleBooking: 1, bundleBookingId: 1, bundleId: 1, bundleName: 1,
      }
    )
      .sort({ createdAt: -1 })
      .limit(30)
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
      {
        $match: {
          organizationId: orgId,
          status: "refunded",
          "refundInfo.processedAt": { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$refundInfo.processedAt" } },
          refunds: { $sum: 1 },
          refundedAmount: { $sum: "$refundInfo.amount" },
        },
      },
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
    SeatChangeRequest.countDocuments({ organizationId: orgId, status: "approved" }),
  ]);

  // ── 2. Shape the response ─────────────────────────────────────

  const totalRevenue = totalRevenueResult[0]?.total || 0;
  const totalTicketsSold = totalTicketsResult[0]?.total || 0;

  const refundStatsResult = refundStats[0] || {};
  const totalRefunds = refundStatsResult.totalRefunds || 0;
  const totalRefundedAmount = refundStatsResult.totalRefundedAmount || 0;
  const totalDeduction = refundStatsResult.totalDeduction || 0;
  const totalOrgRevenue = refundStatsResult.totalOrgRevenue || 0;

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

  // Shape recent bookings — group bundle bookings by bundleBookingId
  const groupedBookingsMap = new Map();
  const individualBookings = [];

  recentBookings.forEach((b) => {
    if (b.isBundleBooking && b.bundleBookingId && b.bundleId) {
      const key = b.bundleBookingId.toString();
      if (!groupedBookingsMap.has(key)) {
        groupedBookingsMap.set(key, {
          id: b.bundleBookingId.toString(),
          detailBookingId: b._id.toString(),
          buyerName: b.buyerName,
          buyerEmail: b.buyerEmail,
          eventName: `Bundle: ${b.bundleName || "Event Bundle"}`,
          eventDate: b.eventDateTime || null,
          eventId: b.eventId || null,
          totalAmount: 0,
          originalAmount: 0,
          status: b.status,
          paymentStatus: b.paymentStatus,
          refundInfo: b.refundInfo || null,
          verified: b.verified || false,
          verifiedAt: b.verifiedAt || null,
          createdAt: b.createdAt,
          isBundle: true,
        });
      }
      const grp = groupedBookingsMap.get(key);
      grp.totalAmount += b.totalAmount;
      grp.originalAmount += b.originalAmount || b.totalAmount;

      if (!b.verified) {
        grp.verified = false;
      }
      if (b.verified && (!grp.verifiedAt || b.verifiedAt > grp.verifiedAt)) {
        grp.verifiedAt = b.verifiedAt;
      }
    } else {
      individualBookings.push({
        id: b._id.toString(),
        detailBookingId: b._id.toString(),
        buyerName: b.buyerName,
        buyerEmail: b.buyerEmail,
        eventName: b.eventName || "Unknown",
        eventDate: b.eventDateTime || null,
        eventId: b.eventId || null,
        totalAmount: b.totalAmount,
        originalAmount: b.originalAmount || b.totalAmount,
        status: b.status,
        paymentStatus: b.paymentStatus,
        refundInfo: b.refundInfo || null,
        verified: b.verified || false,
        verifiedAt: b.verifiedAt || null,
        createdAt: b.createdAt,
        isBundle: false,
      });
    }
  });

  const shapedRecentBookings = [
    ...individualBookings,
    ...Array.from(groupedBookingsMap.values()),
  ]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);

  const result = {
    metrics: {
      totalBookings: totalBookingsResult,
      totalRevenue,
      netRevenue,
      totalTicketsSold,
      totalEvents: eventsCountResult,
      totalVenues: venuesCountResult,
      totalRefunds,
      totalRefundedAmount,
      totalDeduction,
      totalOrgRevenue,
      approvedSwaps: approvedSwapsCount || 0,
    },
    bookingsPerEvent,
    recentBookings: shapedRecentBookings,
    revenueByDay: filledRevenueByDay,
    refundsByEvent,
  };

  setCache(cacheKey, result);
  return result;
};

const getEventAnalytics = async (organizationId, eventId) => {
  const orgId = new mongoose.Types.ObjectId(organizationId);
  const evId = new mongoose.Types.ObjectId(eventId);

  const event = await Event.findOne({ _id: evId, organizationId: orgId }).populate("venueId", "name address");
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const [
    totalBookings,
    totalRevenueResult,
    totalTicketsResult,
    verifiedCount,
    unverifiedCount,
    refundStats,
    recentBookings,
    revenueByDay,
    approvedSwapsCount,
    approvedSwapsList,
  ] = await Promise.all([
    // Total confirmed bookings
    Booking.countDocuments({ eventId: evId, organizationId: orgId, status: "confirmed" }),

    // Total sales revenue
    Booking.aggregate([
      { $match: { eventId: evId, organizationId: orgId, status: "confirmed" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),

    // Total tickets sold
    Booking.aggregate([
      { $match: { eventId: evId, organizationId: orgId, status: "confirmed" } },
      { $unwind: "$items" },
      { $group: { _id: null, total: { $sum: "$items.quantity" } } },
    ]),

    // Verified tickets
    Booking.countDocuments({ eventId: evId, organizationId: orgId, status: "confirmed", verified: true }),

    // Unverified tickets
    Booking.countDocuments({ eventId: evId, organizationId: orgId, status: "confirmed", verified: false }),

    // Refund stats for this event
    Booking.aggregate([
      { $match: { eventId: evId, organizationId: orgId, status: "refunded" } },
      {
        $group: {
          _id: null,
          totalRefunds: { $sum: 1 },
          totalRefundedAmount: { $sum: "$refundInfo.amount" },
        },
      },
    ]),

    // Recent bookings for this event — no populate, use projection
    Booking.find(
      { eventId: evId, organizationId: orgId, status: { $in: ["confirmed", "refunded"] } },
      { buyerName: 1, buyerEmail: 1, totalAmount: 1, status: 1, paymentStatus: 1, verified: 1, verifiedAt: 1, createdAt: 1, selectedSeats: 1 }
    )
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),

    // Revenue trend for last 30 days for this event
    Booking.aggregate([
      {
        $match: {
          eventId: evId,
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
    SeatChangeRequest.countDocuments({ eventId: evId, organizationId: orgId, status: "approved" }),
    SeatChangeRequest.find({ eventId: evId, status: "approved" }).lean(),
  ]);

  const totalRevenue = totalRevenueResult[0]?.total || 0;
  const totalTicketsSold = totalTicketsResult[0]?.total || 0;
  const refundsInfo = refundStats[0] || { totalRefunds: 0, totalRefundedAmount: 0 };

  // Fill in missing days
  const revenueMap = {};
  revenueByDay.forEach((d) => {
    revenueMap[d.date] = { revenue: d.revenue, bookings: d.bookings };
  });

  const filledRevenueByDay = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split("T")[0];
    filledRevenueByDay.push({
      date: dateStr,
      revenue: revenueMap[dateStr]?.revenue || 0,
      bookings: revenueMap[dateStr]?.bookings || 0,
    });
  }

  const shapedRecentBookings = recentBookings.map((b) => {
    const isSwapped = (approvedSwapsList || []).some((swap) => swap.bookingId.toString() === b._id.toString());
    return {
      id: b._id,
      buyerName: b.buyerName,
      buyerEmail: b.buyerEmail,
      totalAmount: b.totalAmount,
      status: b.status,
      paymentStatus: b.paymentStatus,
      verified: b.verified || false,
      verifiedAt: b.verifiedAt || null,
      createdAt: b.createdAt,
      selectedSeats: b.selectedSeats || [],
      isSwapped,
    };
  });

  return {
    event: {
      id: event._id,
      name: event.name,
      dateTime: event.dateTime,
      venueName: event.venueId?.name || "Unknown Venue",
      venueAddress: event.venueId?.address || "",
    },
    metrics: {
      totalBookings,
      totalRevenue,
      totalTicketsSold,
      verifiedTickets: verifiedCount,
      unverifiedTickets: unverifiedCount,
      totalRefunds: refundsInfo.totalRefunds,
      totalRefundedAmount: refundsInfo.totalRefundedAmount,
      approvedSwaps: approvedSwapsCount || 0,
    },
    recentBookings: shapedRecentBookings,
    revenueByDay: filledRevenueByDay,
  };
};

/** Tenant-scoped detail for an analytics booking row. */
const getBookingDetail = async (organizationId, bookingId) => {
  if (!mongoose.Types.ObjectId.isValid(bookingId)) {
    const error = new Error("Invalid booking ID");
    error.statusCode = 400;
    throw error;
  }

  const seed = await Booking.findOne({ _id: bookingId, organizationId }).select("bundleBookingId").lean();
  if (!seed) {
    const error = new Error("Booking not found for this organization");
    error.statusCode = 404;
    throw error;
  }

  const query = seed.bundleBookingId
    ? { organizationId, bundleBookingId: seed.bundleBookingId }
    : { organizationId, _id: bookingId };
  const bookings = await Booking.find(query)
    .populate({ path: "eventId", select: "name dateTime timezone venueId", populate: { path: "venueId", select: "name address city timezone" } })
    .sort({ eventDateTime: 1, createdAt: 1 })
    .lean();
  const seatChanges = await SeatChangeRequest.find({
    organizationId,
    bookingId: { $in: bookings.map((booking) => booking._id) },
  }).sort({ createdAt: 1 }).lean();

  return {
    isBundle: Boolean(seed.bundleBookingId),
    buyer: bookings[0] ? { name: bookings[0].buyerName, email: bookings[0].buyerEmail } : null,
    bookings,
    seatChanges,
  };
};

module.exports = { getOwnerAnalytics, getEventAnalytics, getBookingDetail, invalidateOrgCache };
