const Event = require("../models/Event");
const Organization = require("../models/Organization");

/**
 * GET /api/events
 * Public endpoint — lists all upcoming events across all organizations.
 * No authentication required. Used by the public buyer dashboard (Home page).
 */
const getAllPublicEvents = async (req, res) => {
  try {
    const now = new Date();

    // Fetch events — populate orgId ONLY if org is NOT soft-deleted
    const allEvents = await Event.find({ dateTime: { $gte: now } })
      .select("name description dateTime bannerImageUrl ticketTypes venueId organizationId purchaseMode selectedSeatMap createdAt updatedAt")
      .populate({
        path: "organizationId",
        match: { isDeleted: { $ne: true } },
        select: "name slug",
      })
      .populate("venueId", "name city")
      .sort({ dateTime: 1 })
      .lean();

    // Filter out events whose org was soft-deleted (populate returns null for match miss)
    const validEvents = allEvents.filter((event) => event.organizationId !== null);

    // Shape the response
    const shapedEvents = validEvents.map((event) => {
      let remainingTickets = 0;
      if (event.purchaseMode === "seatmap") {
        if (event.selectedSeatMap && event.selectedSeatMap.blocks) {
          event.selectedSeatMap.blocks.forEach((block) => {
            block.seats?.forEach((seat) => {
              if (seat.status === "available") {
                remainingTickets++;
              }
            });
          });
        }
      } else {
        remainingTickets = event.ticketTypes?.reduce(
          (sum, tt) => sum + (tt.quantityTotal - tt.quantityBooked),
          0
        ) || 0;
      }

      return {
        _id: event._id,
        name: event.name,
        description: event.description,
        dateTime: event.dateTime,
        bannerImageUrl: event.bannerImageUrl,
        ticketTypes: event.ticketTypes,
        purchaseMode: event.purchaseMode,
        remainingTickets,
        venueId: event.venueId,
        organizationId: event.organizationId,
        organizationSlug: event.organizationId?.slug,
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      };
    });

    return res.json({ events: shapedEvents });
  } catch (error) {
    console.error("[Public] Error fetching all events:", error);
    return res.status(500).json({ message: "Could not load events." });
  }
};

/**
 * GET /api/organizations/public
 * Public endpoint — lists all organizations for the filter dropdown.
 */
const getAllOrganizations = async (req, res) => {
  try {
    // Only return organizations that are NOT soft-deleted
    const orgs = await Organization.find({ isDeleted: { $ne: true } })
      .select("name slug")
      .sort({ name: 1 })
      .lean();
    return res.json({ organizations: orgs });
  } catch (error) {
    console.error("[Public] Error fetching organizations:", error);
    return res.status(500).json({ message: "Could not load organizations." });
  }
};

const getAllPublicBundles = async (req, res) => {
  try {
    const EventBundle = require("../models/EventBundle");
    const bundles = await EventBundle.find({})
      .populate({
        path: "organizationId",
        match: { isDeleted: { $ne: true } },
        select: "name slug",
      })
      .populate("eventIds", "name dateTime bannerImageUrl selectedSeatMap purchaseMode")
      .populate("venueId", "name city address")
      .sort({ createdAt: -1 })
      .lean();

    const validBundles = bundles.filter((b) => b.organizationId !== null);

    return res.json({ bundles: validBundles });
  } catch (error) {
    console.error("[Public] Error fetching all bundles:", error);
    return res.status(500).json({ message: "Could not load bundles." });
  }
};

module.exports = { getAllPublicEvents, getAllOrganizations, getAllPublicBundles };
