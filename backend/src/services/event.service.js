const Event = require("../models/Event");
const Venue = require("../models/Venue");

const createEvent = async (data, organizationId, bannerImageUrl) => {
  const { name, description, dateTime, venueId, ticketTypes } = data;

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

  let parsedTicketTypes = [];
  if (ticketTypes) {
    // ticketTypes may arrive as a JSON string (multipart/form-data
    // can't send nested arrays natively) or as a real array (JSON body).
    parsedTicketTypes = typeof ticketTypes === "string" ? JSON.parse(ticketTypes) : ticketTypes;
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
    ticketTypes: parsedTicketTypes,
    timezone: eventTimezone,
  });
};

const listEvents = async (organizationId, assignedVenueIds = null) => {
  const filter = { organizationId };
  if (Array.isArray(assignedVenueIds)) {
    filter.venueId = { $in: assignedVenueIds };
  }
  return Event.find(filter).populate("venueId", "name city").sort({ dateTime: 1 });
};

const getEventById = async (eventId, organizationId) => {
  const event = await Event.findOne({ _id: eventId, organizationId }).populate(
    "venueId",
    "name city"
  );
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }
  return event;
};

const updateEvent = async (eventId, organizationId, updates, bannerImageUrl) => {
  const allowedFields = ["name", "description", "dateTime", "venueId", "ticketTypes"];
  const safeUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (field === "ticketTypes" && typeof updates[field] === "string") {
        safeUpdates[field] = JSON.parse(updates[field]);
      } else {
        safeUpdates[field] = updates[field];
      }
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
