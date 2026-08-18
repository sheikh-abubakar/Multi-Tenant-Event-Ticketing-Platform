const eventService = require("../services/event.service");
const { uploadBufferToS3 } = require("../utils/s3Upload");
const { recordPlatformAudit } = require("../utils/platformAudit");
const EventBundle = require("../models/EventBundle");
const Event = require("../models/Event");
const MediaAsset = require("../models/MediaAsset");
const { notifyOrganization } = require("../services/notification.service");

// If a file was uploaded (req.file.buffer, set by multer's
// memoryStorage), streams it to Cloudinary and returns the hosted
// image URL. Returns undefined if no file was attached to this
// request (e.g. an update that doesn't change the banner).
const buildBannerUrl = async (req) => {
  if (!req.file) return undefined;
  const result = await uploadBufferToS3({ buffer: req.file.buffer, mimetype: req.file.mimetype, folder: "event-banners" });

  try {
    await MediaAsset.create({
      organizationId: req.organizationId,
      originalName: req.file.originalname || "unnamed-image",
      mimeType: req.file.mimetype,
      key: result.key,
      url: result.url,
      size: req.file.size || 0,
    });
  } catch (err) {
    console.error("Auto-saving media asset failed:", err.message);
  }

  return result.url;
};

const create = async (req, res) => {
  try {
    const bannerImageUrl = (await buildBannerUrl(req)) || req.body.bannerImageUrl;
    const event = await eventService.createEvent(req.body, req.organizationId, bannerImageUrl);
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "event.created", targetType: "event", targetId: event._id, metadata: { eventName: event.name } });
    await notifyOrganization(req.organizationId, { type: "event.created", title: "Event created", message: `${req.user.name || req.user.email} created ${event.name}.`, link: `/o/${req.params.orgSlug}/manage/events`, metadata: { eventId: String(event._id) } }, req.user._id);
    return res.status(201).json({ event });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const list = async (req, res) => {
  try {
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
    
    // Check if event is protected by an access code
    const isEventProtected = event.accessCode && (!event.privateCodeExpiry || new Date(event.privateCodeExpiry) > new Date());
    // Fetch all session dates linked to this event group
    const sessions = event.sessions && event.sessions.length > 0
      ? event.sessions
      : [{ _id: event._id, dateTime: event.dateTime }];

    if (isEventProtected) {
      const clientCode = (req.headers["x-event-access-code"] || req.query.accessCode || "").trim();
      const bundleCode = (req.headers["x-bundle-access-code"] || req.query.bundleAccessCode || "").trim();
      
      let unlocked = false;
      if (clientCode && clientCode === event.accessCode) {
        unlocked = true;
      }
      
      if (!unlocked && bundleCode) {
        const bundle = await EventBundle.findOne({
          eventIds: event._id,
          organizationId: req.organizationId,
          accessCode: bundleCode,
        });
        if (bundle) {
          unlocked = true;
        }
      }
      
      // If code is missing or incorrect, lock the event details (hide ticketTypes)
      if (!unlocked) {
        const lockedEvent = {
          _id: event._id,
          name: event.name,
          description: event.description,
          dateTime: event.dateTime,
          bannerImageUrl: event.bannerImageUrl,
          venueId: event.venueId,
          timezone: event.timezone,
          purchaseMode: event.purchaseMode,
          isProtected: true,
          privateCodeExpiry: event.privateCodeExpiry,
        };
        return res.json({ event: lockedEvent, sessions });
      }
    }

    // Unlocked or public: return it but remove accessCode from response for security
    const cleanEvent = { ...event };
    delete cleanEvent.accessCode;
    cleanEvent.isProtected = false;

    return res.json({ event: cleanEvent, sessions });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const bannerImageUrl = (await buildBannerUrl(req)) || req.body.bannerImageUrl;
    const event = await eventService.updateEvent(
      req.params.eventId,
      req.organizationId,
      req.body,
      bannerImageUrl
    );
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "event.updated", targetType: "event", targetId: event._id, metadata: { eventName: event.name } });
    await notifyOrganization(req.organizationId, { type: "event.updated", title: "Event updated", message: `${req.user.name || req.user.email} updated ${event.name}.`, link: `/o/${req.params.orgSlug}/manage/events`, metadata: { eventId: String(event._id) } }, req.user._id);
    return res.json({ event });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const event = await Event.findOne({ _id: req.params.eventId, organizationId: req.organizationId }).select("name").lean();
    await eventService.deleteEvent(req.params.eventId, req.organizationId);
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "event.deleted", targetType: "event", targetId: req.params.eventId });
    await notifyOrganization(req.organizationId, { type: "event.deleted", title: "Event removed", message: `${req.user.name || req.user.email} removed ${event?.name || "an event"}.`, link: `/o/${req.params.orgSlug}/manage/events`, metadata: { eventId: req.params.eventId } }, req.user._id);
    return res.status(204).send();
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const verifyAccess = async (req, res) => {
  try {
    const { accessCode } = req.body;
    if (!accessCode) {
      return res.status(400).json({ message: "Access code is required." });
    }
    const event = await eventService.getEventById(req.params.eventId, req.organizationId);
    const isEventProtected = event.accessCode && (!event.privateCodeExpiry || new Date(event.privateCodeExpiry) > new Date());
    if (!isEventProtected) {
      return res.json({ success: true, message: "Event is not private." });
    }
    if (accessCode.trim() !== event.accessCode.trim()) {
      return res.status(403).json({ message: "Invalid access code." });
    }
    return res.json({ success: true, message: "Access code verified." });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { create, list, listPublic, getOne, update, remove, verifyAccess };
