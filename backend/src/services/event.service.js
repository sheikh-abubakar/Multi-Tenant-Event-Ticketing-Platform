const Event = require("../models/Event");
const Venue = require("../models/Venue");

// A session owns its inventory.  New sessions may reuse an event's visual
// layout, but must never inherit sales or temporary holds from another date.
const cloneSeatMapForNewSession = (sourceMap) => {
  if (!sourceMap || !Array.isArray(sourceMap.blocks) || sourceMap.blocks.length === 0) {
    return null;
  }

  const clone = JSON.parse(JSON.stringify(sourceMap));
  clone.blocks.forEach((block) => {
    (block.seats || []).forEach((seat) => {
      // Organizer holds are deliberate configuration. Checkout holds and
      // sold seats are session-specific transaction state and start free.
      seat.status = seat.status === "organizer-held" ? "organizer-held" : "available";
    });
  });
  clone.updatedAt = new Date().toISOString();
  return clone;
};

const findSessionLayoutSource = (event, preferredSession = null) => {
  if (preferredSession?.selectedSeatMap?.blocks?.length) return preferredSession.selectedSeatMap;
  if (event.selectedSeatMap?.blocks?.length) return event.selectedSeatMap;
  return event.sessions?.find((session) => session.selectedSeatMap?.blocks?.length)?.selectedSeatMap || null;
};

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
    referralRewardAmount: data.referralRewardAmount !== undefined ? Number(data.referralRewardAmount) || 0 : 0,
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
  const allowedFields = ["name", "description", "dateTime", "venueId", "accessCode", "privateCodeExpiry", "sessionDates", "youtubeUrl", "bookingOpeningDateTime", "referralRewardAmount"];
  const safeUpdates = {};

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      if (field === "accessCode") {
        safeUpdates[field] = updates[field] ? String(updates[field]).trim() || null : null;
      } else if (field === "privateCodeExpiry") {
        safeUpdates[field] = updates[field] ? new Date(updates[field]) || null : null;
      } else if (field === "bookingOpeningDateTime") {
        safeUpdates[field] = updates[field] ? new Date(updates[field]) || null : null;
      } else if (field === "referralRewardAmount") {
        safeUpdates[field] = Number(updates[field]) || 0;
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

  // Prevent changing the main date of an event that already occurred
  if (safeUpdates.dateTime && event.dateTime && new Date(event.dateTime) < new Date()) {
    if (new Date(safeUpdates.dateTime).getTime() !== new Date(event.dateTime).getTime()) {
      const error = new Error("This event has already occurred. You cannot change the main date/time. Please add new sessions instead.");
      error.statusCode = 400;
      throw error;
    }
  }

  const primaryDateTime = safeUpdates.dateTime || event.dateTime;

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

  // Booking opening date checks (validated against the latest session date)
  if (updates.bookingOpeningDateTime !== undefined) {
    const newOpeningDate = updates.bookingOpeningDateTime ? new Date(updates.bookingOpeningDateTime) : null;
    
    if (newOpeningDate) {
      const maxSessionTime = Math.max(...sessionsToCheck.map(d => new Date(d).getTime()));
      if (newOpeningDate.getTime() > maxSessionTime) {
        const error = new Error("Booking opening date and time cannot be after the event date and time");
        error.statusCode = 400;
        throw error;
      }

      // Organizers may pause future sales at any time, including after bookings
      // exist. Confirmed bookings and sold seats are intentionally left intact.
    }
  }

  // Only enforce that at least one session is in the future if:
  // - The event was originally in the future, OR
  // - They are actually modifying/updating the session dates or the primary dateTime.
  const originallyInPast = event.dateTime ? new Date(event.dateTime) < new Date() : false;
  const isDateTimeChanged = updates.dateTime !== undefined && new Date(updates.dateTime).getTime() !== new Date(event.dateTime).getTime();
  
  let isSessionDatesChanged = false;
  if (updates.sessionDates !== undefined) {
    let parsedSessionDates = [];
    try {
      parsedSessionDates = typeof updates.sessionDates === "string" ? JSON.parse(updates.sessionDates) : updates.sessionDates;
    } catch (e) {
      parsedSessionDates = [];
    }
    const existingSessionDates = event.sessions?.slice(1).map(s => new Date(s.dateTime).getTime()) || [];
    const newSessionDates = parsedSessionDates.map(d => new Date(d).getTime());
    if (existingSessionDates.length !== newSessionDates.length || !existingSessionDates.every((v, i) => v === newSessionDates[i])) {
      isSessionDatesChanged = true;
    }
  }

  const dateUpdatesProvided = isDateTimeChanged || isSessionDatesChanged;

  if (!originallyInPast || dateUpdatesProvided) {
    const hasFutureSession = sessionsToCheck.some(sDate => new Date(sDate) >= new Date());
    if (!hasFutureSession) {
      const error = new Error("Event date and time cannot be in the past");
      error.statusCode = 400;
      throw error;
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

  const mongoose = require("mongoose");
  Object.entries(safeUpdates).forEach(([key, val]) => {
    event[key] = val;
  });

  if (bannerImageUrl) {
    event.bannerImageUrl = bannerImageUrl;
  }

  // Parse and update sessions array if sessionDates is provided
  const newSessionMapsToPersist = [];
  if (updates.sessionDates !== undefined) {
    let parsedSessionDates = [];
    try {
      parsedSessionDates = typeof updates.sessionDates === "string" ? JSON.parse(updates.sessionDates) : updates.sessionDates;
    } catch (e) {
      parsedSessionDates = [];
    }

    const newSessionsList = [];
    let removedSessionIds = [];
    try {
      removedSessionIds = typeof updates.removedSessionIds === "string"
        ? JSON.parse(updates.removedSessionIds)
        : updates.removedSessionIds || [];
    } catch (error) {
      removedSessionIds = [];
    }
    const removedSessionIdSet = new Set((Array.isArray(removedSessionIds) ? removedSessionIds : []).map(String));
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
        // The primary date is already represented above.
        if (new Date(sDate).getTime() === new Date(primaryDateTime).getTime()) continue;
        const existingSession = event.sessions && event.sessions.length > 0
          ? event.sessions.find((session) => new Date(session.dateTime).getTime() === new Date(sDate).getTime())
          : null;

        if (!existingSession && new Date(sDate) < new Date()) {
          // Only skip if it's a NEW session date in the past
          continue;
        }

        const newSessionId = existingSession ? existingSession._id : new mongoose.Types.ObjectId();
        const newSessionMap = existingSession
          ? existingSession.selectedSeatMap
          : cloneSeatMapForNewSession(findSessionLayoutSource(event, existingPrimary));
        newSessionsList.push({
          _id: newSessionId,
          dateTime: sDate,
          selectedSeatMap: newSessionMap
        });
        if (!existingSession && newSessionMap) {
          newSessionMapsToPersist.push({ sessionId: newSessionId, seatMap: newSessionMap });
        }
      }
    }

    // A session may only disappear through the explicit Remove action. This
    // protects old events from a stale/incomplete edit payload replacing their
    // complete sessions array and losing independent seat-map inventory.
    for (const existingSession of event.sessions || []) {
      const alreadyIncluded = newSessionsList.some(
        (session) => String(session._id) === String(existingSession._id),
      );
      if (!alreadyIncluded && !removedSessionIdSet.has(String(existingSession._id))) {
        newSessionsList.push(existingSession.toObject ? existingSession.toObject() : existingSession);
      }
    }

    event.sessions = newSessionsList;
    event.markModified("sessions");
  } else if (safeUpdates.dateTime && event.sessions && event.sessions.length > 0) {
    event.sessions[0].dateTime = safeUpdates.dateTime;
    event.markModified("sessions");
  }

  await event.save();

  // Mixed nested map fields on old documents can be affected by Mongoose's
  // subdocument casting during a full sessions-array replacement. Persist a
  // newly-created session map explicitly as a final atomic write so it is
  // always a clean inventory copy in MongoDB.
  for (const { sessionId, seatMap } of newSessionMapsToPersist) {
    await Event.updateOne(
      { _id: event._id, organizationId, "sessions._id": sessionId },
      { $set: { "sessions.$.selectedSeatMap": seatMap } },
    );
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
