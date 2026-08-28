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
    const allEvents = await Event.find({
      $or: [
        { dateTime: { $gte: now } },
        { "sessions.dateTime": { $gte: now } }
      ]
    })
      .select("name description dateTime bannerImageUrl ticketTypes venueId organizationId purchaseMode selectedSeatMap sessions categories createdAt updatedAt")
      .populate({
        path: "organizationId",
        match: { isDeleted: { $ne: true } },
        select: "name slug",
      })
      .populate("venueId", "name city")
      .populate("categories", "name slug icon")
      .sort({ dateTime: 1 })
      .lean();

    // Filter out events whose org was soft-deleted (populate returns null for match miss)
    const validEvents = allEvents.filter((event) => event.organizationId !== null);

    // Shape the response
    const shapedEvents = validEvents.map((event) => {
      let displayDateTime = event.dateTime;
      if (event.sessions && event.sessions.length > 0) {
        const upcoming = event.sessions.filter(s => new Date(s.dateTime) >= now)
                                       .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
        if (upcoming.length > 0) {
          displayDateTime = upcoming[0].dateTime;
        }
      }

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
        dateTime: displayDateTime,
        bannerImageUrl: event.bannerImageUrl,
        ticketTypes: event.ticketTypes,
        purchaseMode: event.purchaseMode,
        remainingTickets,
        venueId: event.venueId,
        organizationId: event.organizationId,
        organizationSlug: event.organizationId?.slug,
        categories: event.categories || [],
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
      .populate("eventIds", "name dateTime bannerImageUrl selectedSeatMap purchaseMode sessions")
      .populate("venueId", "name city address")
      .sort({ createdAt: -1 })
      .lean();

    const now = new Date();
    const validBundles = bundles.filter((b) => {
      if (b.organizationId === null) return false;
      // At least one event in the bundle must have an upcoming date or session
      return b.eventIds?.some((event) => {
        if (!event) return false;
        if (new Date(event.dateTime) >= now) return true;
        if (event.sessions && event.sessions.length > 0) {
          return event.sessions.some(s => new Date(s.dateTime) >= now);
        }
        return false;
      });
    });

    return res.json({ bundles: validBundles });
  } catch (error) {
    console.error("[Public] Error fetching all bundles:", error);
    return res.status(500).json({ message: "Could not load bundles." });
  }
};

const getPublicEventById = async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId)
      .populate("organizationId", "name slug")
      .populate("venueId", "name city address")
      .populate("categories", "name slug icon");

    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    return res.json({ event });
  } catch (error) {
    console.error("[Public] Error fetching event by ID:", error);
    return res.status(500).json({ message: "Could not load event details." });
  }
};

module.exports = {
  getAllPublicEvents,
  getAllOrganizations,
  getAllPublicBundles,
  getPublicEventById,
};
