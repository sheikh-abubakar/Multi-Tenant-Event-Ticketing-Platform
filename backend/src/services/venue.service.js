const Venue = require("../models/Venue");

/**
 * IMPORTANT PATTERN — read this before writing any other tenant-scoped
 * service in this project:
 *
 * Every single function here takes `organizationId` and includes it
 * directly INSIDE the database query filter — never as an
 * after-the-fact check. For example, getById does:
 *
 *   Venue.findOne({ _id: venueId, organizationId })
 *
 * NOT:
 *
 *   const venue = await Venue.findById(venueId);
 *   if (venue.organizationId !== organizationId) throw ...
 *
 * The second version is dangerous: it fetches the document FIRST,
 * then checks ownership in application code — easy to forget, easy
 * to get wrong, and one missed check anywhere in the codebase leaks
 * data across tenants. The first version makes it STRUCTURALLY
 * impossible to ever touch another org's document, because the
 * query itself can never match a document belonging to org B while
 * asking for org A. This is exactly what "resource-ownership guard"
 * means in practice.
 */

const createVenue = async (data, organizationId) => {
  const { name, address, city, capacity, timezone } = data;

  if (!name) {
    const error = new Error("Venue name is required");
    error.statusCode = 400;
    throw error;
  }

  return Venue.create({ organizationId, name, address, city, capacity, timezone });
};

const listVenues = async (organizationId) => {
  return Venue.find({ organizationId }).sort({ createdAt: -1 });
};

const getVenueById = async (venueId, organizationId) => {
  const venue = await Venue.findOne({ _id: venueId, organizationId });
  if (!venue) {
    const error = new Error("Venue not found");
    error.statusCode = 404;
    throw error;
  }
  return venue;
};

const updateVenue = async (venueId, organizationId, updates) => {
  const allowedFields = ["name", "address", "city", "capacity", "timezone"];
  const safeUpdates = {};
  for (const field of allowedFields) {
    if (updates[field] !== undefined) safeUpdates[field] = updates[field];
  }

  // findOneAndUpdate with organizationId in the filter: if venueId
  // belongs to a different org, this matches NOTHING and returns
  // null — it can never accidentally update another tenant's venue.
  const venue = await Venue.findOneAndUpdate(
    { _id: venueId, organizationId },
    safeUpdates,
    { new: true, runValidators: true }
  );

  if (!venue) {
    const error = new Error("Venue not found");
    error.statusCode = 404;
    throw error;
  }
  return venue;
};

const deleteVenue = async (venueId, organizationId) => {
  const venue = await Venue.findOneAndDelete({ _id: venueId, organizationId });
  if (!venue) {
    const error = new Error("Venue not found");
    error.statusCode = 404;
    throw error;
  }
  return venue;
};

module.exports = { createVenue, listVenues, getVenueById, updateVenue, deleteVenue };
