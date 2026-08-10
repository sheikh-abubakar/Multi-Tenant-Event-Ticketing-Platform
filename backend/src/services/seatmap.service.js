const crypto = require("crypto");
const Venue = require("../models/Venue");
const Event = require("../models/Event");

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
};

const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

const normaliseMap = (value, { eventMode = false } = {}) => {
  const map = typeof value === "string" ? JSON.parse(value) : value;
  if (!map || typeof map !== "object") fail("seatmap is required");
  if (!Array.isArray(map.blocks) || !Array.isArray(map.shapes) || !Array.isArray(map.sections)) {
    fail("seatmap must include blocks, shapes and sections arrays");
  }
  const blocks = map.blocks.map((block) => {
    if (!block || typeof block !== "object") fail("Invalid seatmap block");
    const blockId = block.id || makeId("block");
    const seats = Array.isArray(block.seats) ? block.seats.map((seat) => ({
      ...seat,
      id: seat.id || makeId("seat"),
      status: seat.status || "available",
      seatName: seat.seatName || seat.label || "Seat",
      type: seat.type || null,
    })) : [];
    return {
      ...block,
      id: blockId,
      type: block.type || "seat",
      price: eventMode ? Number(block.price || 0) : undefined,
      seats,
    };
  });
  if (eventMode && blocks.some((block) => block.price < 0)) fail("Seat prices cannot be negative");
  return {
    ...map,
    id: map.id || makeId("seatmap"),
    name: String(map.name || "Untitled seat map").trim(),
    blocks,
    shapes: map.shapes,
    sections: map.sections,
    boundary: map.boundary || { width: 1200, height: 800, x: 0, y: 0, color: "#111827", visible: true },
    updatedAt: new Date().toISOString(),
  };
};

const inventoryById = (map) => new Map(
  (map?.blocks || []).flatMap((block) => (block.seats || []).map((seat) => [
    `${block.id}:${seat.id}`,
    { block, seat },
  ])),
);

const assertProtectedInventory = (oldMap, nextMap) => {
  const previous = inventoryById(oldMap);
  const next = inventoryById(nextMap);
  for (const [key, { seat }] of previous) {
    if (["sold", "checkout-held"].includes(seat.status)) {
      const replacement = next.get(key);
      if (!replacement || replacement.seat.seatName !== seat.seatName) {
        fail("Sold or checkout-held seats cannot be removed or renamed", 409);
      }
      replacement.seat.status = seat.status;
    }
  }
};

const listVenueSeatmaps = async (venueId, organizationId) => {
  const venue = await Venue.findOne({ _id: venueId, organizationId }).select("seatmaps");
  if (!venue) fail("Venue not found", 404);
  return venue.seatmaps || [];
};

const createVenueSeatmap = async (venueId, organizationId, rawMap) => {
  const venue = await Venue.findOne({ _id: venueId, organizationId });
  if (!venue) fail("Venue not found", 404);
  const map = normaliseMap(rawMap);
  venue.seatmaps.push(map);
  await venue.save();
  return map;
};

const updateVenueSeatmap = async (venueId, seatmapId, organizationId, rawMap) => {
  const venue = await Venue.findOne({ _id: venueId, organizationId });
  if (!venue) fail("Venue not found", 404);
  const index = venue.seatmaps.findIndex((map) => String(map.id) === String(seatmapId));
  if (index < 0) fail("Seatmap template not found", 404);
  const map = normaliseMap({ ...(typeof rawMap === "string" ? JSON.parse(rawMap) : rawMap), id: seatmapId });
  venue.seatmaps[index] = map;
  venue.markModified("seatmaps");
  await venue.save();
  return map;
};

const deleteVenueSeatmap = async (venueId, seatmapId, organizationId) => {
  const venue = await Venue.findOne({ _id: venueId, organizationId });
  if (!venue) fail("Venue not found", 404);
  const initialLength = venue.seatmaps.length;
  venue.seatmaps = venue.seatmaps.filter((map) => String(map.id) !== String(seatmapId));
  if (venue.seatmaps.length === initialLength) fail("Seatmap template not found", 404);
  await venue.save();
};

const getEventSeatmap = async (eventId, organizationId, sessionId) => {
  const event = await Event.findOne({ _id: eventId, organizationId });
  if (!event) fail("Event not found", 404);

  // If no sessions exist (legacy single session event), return root map
  if (!event.sessions || event.sessions.length === 0) {
    if (event.purchaseMode !== "seatmap" || !event.selectedSeatMap) {
      fail("This event does not have a seat map", 404);
    }
    return event.selectedSeatMap;
  }

  // Find the requested session
  const session = event.sessions.find(s => String(s._id) === String(sessionId)) ||
                  event.sessions.find(s => new Date(s.dateTime) >= new Date()) ||
                  event.sessions[0];
  if (!session) fail("Session not found", 404);

  // Self-healing fallback: if target session map is empty, clone from first configured session or event root map
  if (!session.selectedSeatMap || !session.selectedSeatMap.blocks || session.selectedSeatMap.blocks.length === 0) {
    const configuredSister = event.sessions.find(s => s.selectedSeatMap && s.selectedSeatMap.blocks && s.selectedSeatMap.blocks.length > 0) || { selectedSeatMap: event.selectedSeatMap };
    if (configuredSister && configuredSister.selectedSeatMap && configuredSister.selectedSeatMap.blocks && configuredSister.selectedSeatMap.blocks.length > 0) {
      const cleanClone = JSON.parse(JSON.stringify(configuredSister.selectedSeatMap));
      if (cleanClone.blocks) {
        cleanClone.blocks.forEach((block) => {
          if (block.seats) {
            block.seats.forEach((seat) => {
              seat.status = "available";
            });
          }
        });
      }
      session.selectedSeatMap = cleanClone;
      event.markModified("sessions");
      await event.save();
      return cleanClone;
    }
  }

  if (!session.selectedSeatMap) {
    fail("This event session does not have a seat map configured", 404);
  }

  return session.selectedSeatMap;
};

const propagateMapToSessions = (event, map, sourceSessionId) => {
  if (!event.sessions || event.sessions.length <= 1) return;

  event.sessions.forEach((session) => {
    // Skip the session that was just saved/edited
    if (sourceSessionId && String(session._id) === String(sourceSessionId)) {
      return;
    }

    const cleanClone = JSON.parse(JSON.stringify(map));
    
    // If the session already has a seat map, let's preserve the seat statuses
    if (session.selectedSeatMap && session.selectedSeatMap.blocks) {
      // Map of existing seat statuses: "blockId:seatId" -> status
      const existingStatusMap = {};
      session.selectedSeatMap.blocks.forEach((block) => {
        if (block.seats) {
          block.seats.forEach((seat) => {
            existingStatusMap[`${block.id}:${seat.id}`] = seat.status;
          });
        }
      });

      // Apply preserved statuses to cleanClone
      if (cleanClone.blocks) {
        cleanClone.blocks.forEach((block) => {
          if (block.seats) {
            block.seats.forEach((seat) => {
              const prevStatus = existingStatusMap[`${block.id}:${seat.id}`];
              if (prevStatus && ["sold", "checkout-held", "transfer-held"].includes(prevStatus)) {
                seat.status = prevStatus;
              } else {
                seat.status = "available";
              }
            });
          }
        });
      }
    } else {
      // No existing seatmap, so all seats are available
      if (cleanClone.blocks) {
        cleanClone.blocks.forEach((block) => {
          if (block.seats) {
            block.seats.forEach((seat) => {
              seat.status = "available";
            });
          }
        });
      }
    }

    session.selectedSeatMap = cleanClone;
  });
};

const saveEventSeatmap = async (eventId, organizationId, rawMap, sessionId) => {
  const event = await Event.findOne({ _id: eventId, organizationId });
  if (!event) fail("Event not found", 404);
  const map = normaliseMap(rawMap, { eventMode: true });

  event.purchaseMode = "seatmap";

  if (!event.sessions || event.sessions.length === 0) {
    assertProtectedInventory(event.selectedSeatMap, map);
    event.selectedSeatMap = map;
    event.markModified("selectedSeatMap");
  } else {
    const session = event.sessions.find(s => String(s._id) === String(sessionId)) || event.sessions[0];
    assertProtectedInventory(session.selectedSeatMap, map);
    session.selectedSeatMap = map;
    
    // Also save to root as default fallback
    event.selectedSeatMap = map;
    
    propagateMapToSessions(event, map, session._id);
    event.markModified("sessions");
    event.markModified("selectedSeatMap");
  }

  await event.save();
  return map;
};

const seedEventSeatmapFromTemplate = async (eventId, organizationId, seatmapId, sessionId) => {
  const event = await Event.findOne({ _id: eventId, organizationId });
  if (!event) fail("Event not found", 404);
  const venue = await Venue.findOne({ _id: event.venueId, organizationId });
  if (!venue) fail("Venue not found", 404);
  const template = venue.seatmaps.find((map) => String(map.id) === String(seatmapId));
  if (!template) fail("Seatmap template not found", 404);
  const clone = normaliseMap(JSON.parse(JSON.stringify(template)), { eventMode: true });

  event.purchaseMode = "seatmap";

  if (!event.sessions || event.sessions.length === 0) {
    event.selectedSeatMap = clone;
    event.markModified("selectedSeatMap");
  } else {
    const session = event.sessions.find(s => String(s._id) === String(sessionId)) || event.sessions[0];
    session.selectedSeatMap = clone;
    
    // Also save to root as default fallback
    event.selectedSeatMap = clone;

    propagateMapToSessions(event, clone, session._id);
    event.markModified("sessions");
    event.markModified("selectedSeatMap");
  }

  await event.save();
  return clone;
};

module.exports = { listVenueSeatmaps, createVenueSeatmap, updateVenueSeatmap, deleteVenueSeatmap, getEventSeatmap, saveEventSeatmap, seedEventSeatmapFromTemplate };
