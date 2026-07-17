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
    console.log("[Public] Fetching events, now:", now.toISOString());

    // Fetch ALL events first (no date filter) to debug
    const allEvents = await Event.find({})
      .populate("organizationId", "name slug")
      .populate("venueId", "name address city")
      .sort({ dateTime: 1 })
      .lean();

    console.log("[Public] Total events in DB:", allEvents.length);
    allEvents.forEach((e) => {
      console.log(
        `  - ${e.name}: dateTime=${e.dateTime}, isFuture=${new Date(e.dateTime) >= now}`,
      );
    });

    // Filter to only upcoming events
    const upcomingEvents = allEvents.filter((event) => {
      const eventDate = new Date(event.dateTime);
      return eventDate >= now;
    });

    console.log("[Public] Upcoming events:", upcomingEvents.length);

    // Shape the response
    const shapedEvents = upcomingEvents.map((event) => ({
      _id: event._id,
      name: event.name,
      description: event.description,
      dateTime: event.dateTime,
      bannerImageUrl: event.bannerImageUrl,
      ticketTypes: event.ticketTypes,
      venueId: event.venueId,
      organizationId: event.organizationId,
      organizationSlug: event.organizationId?.slug,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    }));

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
    const orgs = await Organization.find({}).sort({ name: 1 }).lean();
    return res.json({ organizations: orgs });
  } catch (error) {
    console.error("[Public] Error fetching organizations:", error);
    return res.status(500).json({ message: "Could not load organizations." });
  }
};

module.exports = { getAllPublicEvents, getAllOrganizations };