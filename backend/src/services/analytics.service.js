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

    // Recent 10 bookings (for the table)
    Booking.find({ organizationId: orgId, status: "confirmed" })
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
  ]);

  // ── 2. Shape the response ─────────────────────────────────────

  const totalRevenue = totalRevenueResult[0]?.total || 0;
  const totalTicketsSold = totalTicketsResult[0]?.total || 0;

  // Fill in missing days in revenueByDay with zeroes
  const revenueMap = {};
  revenueByDay.forEach((d) => {
    revenueMap[d.date] = { revenue: d.revenue, bookings: d.bookings };
  });

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
    });
  }

  // Shape recent bookings
  const shapedRecentBookings = recentBookings.map((b) => ({
    id: b._id,
    buyerName: b.buyerName,
    buyerEmail: b.buyerEmail,
    eventName: b.eventId?.name || "Unknown",
    eventDate: b.eventId?.dateTime || null,
    totalAmount: b.totalAmount,
    status: b.status,
    createdAt: b.createdAt,
  }));

  return {
    metrics: {
      totalBookings: totalBookingsResult,
      totalRevenue,
      totalTicketsSold,
      totalEvents: eventsCountResult,
      totalVenues: venuesCountResult,
    },
    bookingsPerEvent,
    recentBookings: shapedRecentBookings,
    revenueByDay: filledRevenueByDay,
  };
};

module.exports = { getOwnerAnalytics };