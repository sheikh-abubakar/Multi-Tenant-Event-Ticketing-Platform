const seatmapService = require("../services/seatmap.service");

const respond = (fn) => async (req, res) => {
  try { return res.json(await fn(req)); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
};

const listTemplates = respond(async (req) => ({ seatmaps: await seatmapService.listVenueSeatmaps(req.params.venueId, req.organizationId) }));
const createTemplate = async (req, res) => { try { const seatmap = await seatmapService.createVenueSeatmap(req.params.venueId, req.organizationId, req.body.seatmap || req.body); return res.status(201).json({ seatmap }); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); } };
const updateTemplate = respond(async (req) => ({ seatmap: await seatmapService.updateVenueSeatmap(req.params.venueId, req.params.seatmapId, req.organizationId, req.body.seatmap || req.body) }));
const removeTemplate = async (req, res) => { try { await seatmapService.deleteVenueSeatmap(req.params.venueId, req.params.seatmapId, req.organizationId); return res.status(204).send(); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); } };
const getEventMap = async (req, res) => {
  try {
    // Prevent browser and proxy caching for live seat status endpoints
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const Event = require("../models/Event");
    const EventBundle = require("../models/EventBundle");
    const event = await Event.findOne({ _id: req.params.eventId, organizationId: req.organizationId }).lean();
    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (event.accessCode) {
      const eventCode = (req.headers["x-event-access-code"] || req.query.accessCode || "").trim();
      const bundleCode = (req.headers["x-bundle-access-code"] || req.query.bundleAccessCode || "").trim();

      let unlocked = false;

      // 1. Check direct event access code
      if (eventCode && eventCode === event.accessCode) {
        unlocked = true;
      }

      // 2. Check if accessed via an unlocked bundle (Case 1 & 2)
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

      if (!unlocked) {
        return res.status(403).json({
          message: "This event is protected. A valid access code is required.",
          isProtected: true,
          eventId: event._id,
        });
      }
    }

    const seatmap = await seatmapService.getEventSeatmap(req.params.eventId, req.organizationId);
    return res.json({ seatmap });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};
const saveEventMap = respond(async (req) => ({ seatmap: await seatmapService.saveEventSeatmap(req.params.eventId, req.organizationId, req.body.seatmap || req.body) }));
const seedEventMap = respond(async (req) => ({ seatmap: await seatmapService.seedEventSeatmapFromTemplate(req.params.eventId, req.organizationId, req.body.seatmapId) }));

module.exports = { listTemplates, createTemplate, updateTemplate, removeTemplate, getEventMap, saveEventMap, seedEventMap };
