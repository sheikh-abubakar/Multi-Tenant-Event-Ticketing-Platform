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

const getEventSeatmap = async (eventId, organizationId) => {
  const event = await Event.findOne({ _id: eventId, organizationId }).select("selectedSeatMap purchaseMode name");
  if (!event) fail("Event not found", 404);
  if (event.purchaseMode !== "seatmap" || !event.selectedSeatMap) fail("This event does not have a seat map", 404);
  return event.selectedSeatMap;
};

const saveEventSeatmap = async (eventId, organizationId, rawMap) => {
  const event = await Event.findOne({ _id: eventId, organizationId });
  if (!event) fail("Event not found", 404);
  const map = normaliseMap(rawMap, { eventMode: true });
  assertProtectedInventory(event.selectedSeatMap, map);
  event.purchaseMode = "seatmap";
  event.selectedSeatMap = map;
  event.markModified("selectedSeatMap");
  await event.save();
  return map;
};

const seedEventSeatmapFromTemplate = async (eventId, organizationId, seatmapId) => {
  const event = await Event.findOne({ _id: eventId, organizationId });
  if (!event) fail("Event not found", 404);
  const venue = await Venue.findOne({ _id: event.venueId, organizationId });
  if (!venue) fail("Venue not found", 404);
  const template = venue.seatmaps.find((map) => String(map.id) === String(seatmapId));
  if (!template) fail("Seatmap template not found", 404);
  const clone = normaliseMap(JSON.parse(JSON.stringify(template)), { eventMode: true });
  event.selectedSeatMap = clone;
  event.purchaseMode = "seatmap";
  event.markModified("selectedSeatMap");
  await event.save();
  return clone;
};

module.exports = { listVenueSeatmaps, createVenueSeatmap, updateVenueSeatmap, deleteVenueSeatmap, getEventSeatmap, saveEventSeatmap, seedEventSeatmapFromTemplate };
