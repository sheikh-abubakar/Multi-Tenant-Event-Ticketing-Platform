const seatmapService = require("../services/seatmap.service");

const respond = (fn) => async (req, res) => {
  try { return res.json(await fn(req)); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); }
};

const listTemplates = respond(async (req) => ({ seatmaps: await seatmapService.listVenueSeatmaps(req.params.venueId, req.organizationId) }));
const createTemplate = async (req, res) => { try { const seatmap = await seatmapService.createVenueSeatmap(req.params.venueId, req.organizationId, req.body.seatmap || req.body); return res.status(201).json({ seatmap }); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); } };
const updateTemplate = respond(async (req) => ({ seatmap: await seatmapService.updateVenueSeatmap(req.params.venueId, req.params.seatmapId, req.organizationId, req.body.seatmap || req.body) }));
const removeTemplate = async (req, res) => { try { await seatmapService.deleteVenueSeatmap(req.params.venueId, req.params.seatmapId, req.organizationId); return res.status(204).send(); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message }); } };
const getEventMap = respond(async (req) => ({ seatmap: await seatmapService.getEventSeatmap(req.params.eventId, req.organizationId) }));
const saveEventMap = respond(async (req) => ({ seatmap: await seatmapService.saveEventSeatmap(req.params.eventId, req.organizationId, req.body.seatmap || req.body) }));
const seedEventMap = respond(async (req) => ({ seatmap: await seatmapService.seedEventSeatmapFromTemplate(req.params.eventId, req.organizationId, req.body.seatmapId) }));

module.exports = { listTemplates, createTemplate, updateTemplate, removeTemplate, getEventMap, saveEventMap, seedEventMap };
