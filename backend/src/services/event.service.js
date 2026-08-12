const Event = require("../models/Event");
const Venue = require("../models/Venue");

const createEvent = async (data, organizationId, bannerImageUrl) => {
  const { name, description, dateTime, venueId, accessCode, privateCodeExpiry, sessionDates, bookingOpeningDateTime } = data;

  if (!name || !dateTime || !venueId) {
    const error = new Error("name, dateTime and venueId are required");
    error.statusCode = 400;
    throw error;
  }

  if (new Date(dateTime) < new Date()) {
    const error = new Error("Event date and time cannot be in the past");
    error.statusCode = 400;
    throw error;
  }

  if (bookingOpeningDateTime) {
    if (new Date(bookingOpeningDateTime) < new Date()) {
      const error = new Error("Booking opening date and time cannot be in the past");
      error.statusCode = 400;
      throw error;
    }
    if (new Date(bookingOpeningDateTime) > new Date(dateTime)) {
      const error = new Error("Booking opening date and time cannot be after the event date and time");
      error.statusCode = 400;
      throw error;
    }
  }

  let parsedSessionDates = [];
  if (sessionDates) {
    try {
      parsedSessionDates = typeof sessionDates === "string" ? JSON.parse(sessionDates) : sessionDates;
    } catch (e) {
      parsedSessionDates = [];
    }
  }

  const venue = await Venue.findOne({ _id: venueId, organizationId });
  if (!venue) {
    const error = new Error("Venue not found in this organization");
    error.statusCode = 404;
    throw error;
  }

  const eventTimezone = venue.timezone || "Asia/Karachi";

  const sessionsList = [];
  sessionsList.push({ dateTime, selectedSeatMap: null });

  if (Array.isArray(parsedSessionDates) && parsedSessionDates.length > 0) {
    for (const sDate of parsedSessionDates) {
      if (new Date(sDate) < new Date()) continue;
      sessionsList.push({ dateTime: sDate, selectedSeatMap: null });
    }
  }

  return Event.create({
    organizationId,
    venueId,
    name,
    description,
    dateTime,
    bannerImageUrl,
    youtubeUrl: data.youtubeUrl ? String(data.youtubeUrl).trim() || null : null,
    purchaseMode: "seatmap",
    ticketTypes: [],
    timezone: eventTimezone,
    accessCode: accessCode ? String(accessCode).trim() || null : null,
    privateCodeExpiry: privateCodeExpiry ? new Date(privateCodeExpiry) || null : null,
    bookingOpeningDateTime: bookingOpeningDateTime ? new Date(bookingOpeningDateTime) : null,
    sessions: sessionsList,
  });
};

const listEvents = async (organizationId, assignedVenueIds = null, { includeSeatMap = true } = {}) => {
  const filter = { organizationId };
  if (Array.isArray(assignedVenueIds)) {
    filter.venueId = { $in: assignedVenueIds };
  }
  const events = await Event.find(filter).populate("venueId", "name city").sort({ dateTime: 1 }).lean();

  return events.map((event) => {
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

    const shaped = {
      ...event,
      remainingTickets,
    };
    if (!includeSeatMap) {
      delete shaped.selectedSeatMap;
    }
    return shaped;
  });
};

const getEventById = async (eventId, organizationId) => {
  const event = await Event.findOne({ _id: eventId, organizationId })
    .select("name description dateTime bannerImageUrl youtubeUrl ticketTypes purchaseMode venueId timezone accessCode privateCodeExpiry bookingOpeningDateTime sessions createdAt updatedAt")
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
  const allowedFields = ["name", "description", "dateTime", "venueId", "accessCode", "privateCodeExpiry", "sessionDates", "youtubeUrl", "bookingOpeningDateTime"];
  const safeUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (field === "accessCode") {
        safeUpdates[field] = updates[field] ? String(updates[field]).trim() || null : null;
      } else if (field === "privateCodeExpiry") {
        safeUpdates[field] = updates[field] ? new Date(updates[field]) || null : null;
      } else if (field === "bookingOpeningDateTime") {
        safeUpdates[field] = updates[field] ? new Date(updates[field]) || null : null;
      } else {
        safeUpdates[field] = updates[field];
      }
    }
  }

  const event = await Event.findOne({ _id: eventId, organizationId });
  if (!event) {
    const error = new Error("Event not found");
    error.statusCode = 404;
    throw error;
  }

  const primaryDateTime = safeUpdates.dateTime || event.dateTime;

  // Booking opening date checks
  if (updates.bookingOpeningDateTime !== undefined) {
    const newOpeningDate = updates.bookingOpeningDateTime ? new Date(updates.bookingOpeningDateTime) : null;
    
    if (newOpeningDate) {
      if (newOpeningDate > new Date(primaryDateTime)) {
        const error = new Error("Booking opening date and time cannot be after the event date and time");
        error.statusCode = 400;
        throw error;
      }

      if (newOpeningDate > new Date()) {
        const Booking = require("../models/Booking");
        const existingBookingsCount = await Booking.countDocuments({
          eventId,
          status: { $in: ["confirmed", "refunded"] }
        });
        if (existingBookingsCount > 0) {
          const error = new Error("Cannot set booking opening time to the future because tickets/seats have already been booked for this event.");
          error.statusCode = 400;
          throw error;
        }
      }
    }
  }

  let sessionsToCheck = [primaryDateTime];
  if (updates.sessionDates !== undefined) {
    let parsedSessionDates = [];
    try {
      parsedSessionDates = typeof updates.sessionDates === "string" ? JSON.parse(updates.sessionDates) : updates.sessionDates;
    } catch (e) {
      parsedSessionDates = [];
    }
    if (Array.isArray(parsedSessionDates)) {
      sessionsToCheck = [...sessionsToCheck, ...parsedSessionDates];
    }
  } else if (event.sessions && event.sessions.length > 0) {
    sessionsToCheck = event.sessions.map(s => s.dateTime);
  }

  const hasFutureSession = sessionsToCheck.some(sDate => new Date(sDate) >= new Date());
  if (!hasFutureSession) {
    const error = new Error("Event date and time cannot be in the past");
    error.statusCode = 400;
    throw error;
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

  const mongoose = require("mongoose");
  Object.entries(safeUpdates).forEach(([key, val]) => {
    event[key] = val;
  });

  if (bannerImageUrl) {
    event.bannerImageUrl = bannerImageUrl;
  }

  // Parse and update sessions array if sessionDates is provided
  if (updates.sessionDates !== undefined) {
    let parsedSessionDates = [];
    try {
      parsedSessionDates = typeof updates.sessionDates === "string" ? JSON.parse(updates.sessionDates) : updates.sessionDates;
    } catch (e) {
      parsedSessionDates = [];
    }

    const newSessionsList = [];
    const primaryDateTime = safeUpdates.dateTime || event.dateTime;

    // Preserve primary session's seatmap if possible
    const existingPrimary = event.sessions && event.sessions.length > 0
      ? (event.sessions.find(s => String(s.dateTime) === String(primaryDateTime)) || event.sessions[0])
      : null;

    newSessionsList.push({
      _id: existingPrimary ? existingPrimary._id : new mongoose.Types.ObjectId(),
      dateTime: primaryDateTime,
      selectedSeatMap: existingPrimary ? existingPrimary.selectedSeatMap : null
    });

    if (Array.isArray(parsedSessionDates)) {
      for (const sDate of parsedSessionDates) {
        const existingSession = event.sessions && event.sessions.length > 0
          ? event.sessions.find(s => String(new Date(s.dateTime)) === String(new Date(sDate)))
          : null;

        if (!existingSession && new Date(sDate) < new Date()) {
          // Only skip if it's a NEW session date in the past
          continue;
        }

        newSessionsList.push({
          _id: existingSession ? existingSession._id : new mongoose.Types.ObjectId(),
          dateTime: sDate,
          selectedSeatMap: existingSession ? existingSession.selectedSeatMap : null
        });
      }
    }

    event.sessions = newSessionsList;
    event.markModified("sessions");
  } else if (safeUpdates.dateTime && event.sessions && event.sessions.length > 0) {
    event.sessions[0].dateTime = safeUpdates.dateTime;
    event.markModified("sessions");
  }

  await event.save();
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
