const Event = require("../models/Event");
const Venue = require("../models/Venue");

const createEvent = async (data, organizationId, bannerImageUrl) => {
  const { name, description, dateTime, venueId } = data;

  if (!name || !dateTime || !venueId) {
    const error = new Error("name, dateTime and venueId are required");
    error.statusCode = 400;
    throw error;
  }

  // Cross-check: the venue being attached to this event must belong
  // to THE SAME org as the event. Without this check, someone could
  // create an event in Org A that points at a venueId belonging to
  // Org B — a subtle cross-tenant data link. Same guard pattern as
  // before: filter by _id AND organizationId together.
  const venue = await Venue.findOne({ _id: venueId, organizationId });
  if (!venue) {
    const error = new Error("Venue not found in this organization");
    error.statusCode = 404;
    throw error;
  }

  // Inherit timezone from venue
  const eventTimezone = venue.timezone || "Asia/Karachi";

  return Event.create({
    organizationId,
    venueId,
    name,
    description,
    dateTime,
    bannerImageUrl,
    purchaseMode: "seatmap",
    ticketTypes: [],
    timezone: eventTimezone,
  });
};

const listEvents = async (organizationId, assignedVenueIds = null, { includeSeatMap = true } = {}) => {
  const filter = { organizationId };
  if (Array.isArray(assignedVenueIds)) {
    filter.venueId = { $in: assignedVenueIds };
  }
  const query = Event.find(filter).populate("venueId", "name city").sort({ dateTime: 1 });
  if (!includeSeatMap) {
    query.select("name description dateTime bannerImageUrl ticketTypes purchaseMode venueId timezone createdAt updatedAt");
  }
  return query.lean();
};

const getEventById = async (eventId, organizationId) => {
  const event = await Event.findOne({ _id: eventId, organizationId })
    .select("name description dateTime bannerImageUrl ticketTypes purchaseMode venueId timezone createdAt updatedAt")
    .populate("venueId", "name city")
    .lean();
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }
  return event;
};

const updateEvent = async (eventId, organizationId, updates, bannerImageUrl) => {
  // Ticket types are intentionally absent: all new events are seat-map
  // events. Legacy documents remain readable because their old values are
  // never overwritten by this metadata editor.
  const allowedFields = ["name", "description", "dateTime", "venueId"];
  const safeUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      safeUpdates[field] = updates[field];
    }
  }

  // If venueId is being changed, re-validate it belongs to this org.
  if (safeUpdates.venueId) {
    const venue = await Venue.findOne({ _id: safeUpdates.venueId, organizationId });
    if (!venue) {
      const error = new Error("Venue not found in this organization");
      error.statusCode = 404;
      throw error;
    }
  }

  if (bannerImageUrl) {
    safeUpdates.bannerImageUrl = bannerImageUrl;
  }

  const event = await Event.findOneAndUpdate(
    { _id: eventId, organizationId },
    safeUpdates,
    { new: true, runValidators: true }
  );

  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }
  return event;
};

const deleteEvent = async (eventId, organizationId) => {
  const event = await Event.findOneAndDelete({ _id: eventId, organizationId });
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }
  return event;
};

module.exports = { createEvent, listEvents, getEventById, updateEvent, deleteEvent };
