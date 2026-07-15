const eventService = require("../services/event.service");

// Builds a URL the frontend can use to load the uploaded image.
// req.file.filename is set by multer (see middlewares/upload.js).
const buildBannerUrl = (req) => {
  if (!req.file) return undefined;
  return `/uploads/event-banners/${req.file.filename}`;
};

const create = async (req, res) => {
  try {
    const bannerImageUrl = buildBannerUrl(req);
    const event = await eventService.createEvent(req.body, req.organizationId, bannerImageUrl);
    return res.status(201).json({ event });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const list = async (req, res) => {
  try {
    const events = await eventService.listEvents(req.organizationId);
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
    const bannerImageUrl = buildBannerUrl(req);
    const event = await eventService.updateEvent(
      req.params.eventId,
      req.organizationId,
      req.body,
      bannerImageUrl
    );
    return res.json({ event });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    await eventService.deleteEvent(req.params.eventId, req.organizationId);
    return res.status(204).send();
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { create, list, getOne, update, remove };
