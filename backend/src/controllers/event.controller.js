const eventService = require("../services/event.service");
const { uploadBufferToCloudinary } = require("../utils/cloudinaryUpload");
const { recordPlatformAudit } = require("../utils/platformAudit");

// If a file was uploaded (req.file.buffer, set by multer's
// memoryStorage), streams it to Cloudinary and returns the hosted
// image URL. Returns undefined if no file was attached to this
// request (e.g. an update that doesn't change the banner).
const buildBannerUrl = async (req) => {
  if (!req.file) return undefined;
  const result = await uploadBufferToCloudinary(req.file.buffer, "event-banners");
  return result.secure_url;
};

const create = async (req, res) => {
  try {
    const bannerImageUrl = await buildBannerUrl(req);
    const event = await eventService.createEvent(req.body, req.organizationId, bannerImageUrl);
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "event.created", targetType: "event", targetId: event._id, metadata: { eventName: event.name } });
    return res.status(201).json({ event });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const list = async (req, res) => {
  try {
    // If assignedVenueIds is set (from filterByAssignedVenues middleware),
    // pass it to the service. Otherwise pass null (show all).
    const events = await eventService.listEvents(req.organizationId, req.assignedVenueIds);
    return res.json({ events });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const listPublic = async (req, res) => {
  try {
    const events = await eventService.listEvents(req.organizationId, null, { includeSeatMap: false });
    return res.json({ events });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getOne = async (req, res) => {
  try {
    const event = await eventService.getEventById(req.params.eventId, req.organizationId);
    return res.json({ event });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const bannerImageUrl = await buildBannerUrl(req);
    const event = await eventService.updateEvent(
      req.params.eventId,
      req.organizationId,
      req.body,
      bannerImageUrl
    );
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "event.updated", targetType: "event", targetId: event._id, metadata: { eventName: event.name } });
    return res.json({ event });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    await eventService.deleteEvent(req.params.eventId, req.organizationId);
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "event.deleted", targetType: "event", targetId: req.params.eventId });
    return res.status(204).send();
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { create, list, listPublic, getOne, update, remove };
