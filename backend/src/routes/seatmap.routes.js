const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkRole = require("../middlewares/checkRole");
const controller = require("../controllers/seatmap.controller");

const templates = express.Router({ mergeParams: true });
// Seat-map setup is operational event work. Staff already has venue/event
// create/update permission in this product, so allow all three organizer
// roles here; tenant membership is still mandatory.
templates.use(authenticate, resolveTenant, loadMembership, checkRole(["owner", "admin", "staff"]));
templates.get("/:venueId/seatmaps", controller.listTemplates);
templates.post("/:venueId/seatmaps", controller.createTemplate);
templates.put("/:venueId/seatmaps/:seatmapId", controller.updateTemplate);
templates.delete("/:venueId/seatmaps/:seatmapId", controller.removeTemplate);

const eventMaps = express.Router({ mergeParams: true });
eventMaps.get("/:eventId/seatmap", resolveTenant, controller.getEventMap);
eventMaps.post("/:eventId/seatmap/seed", authenticate, resolveTenant, loadMembership, checkRole(["owner", "admin", "staff"]), controller.seedEventMap);
eventMaps.put("/:eventId/seatmap", authenticate, resolveTenant, loadMembership, checkRole(["owner", "admin", "staff"]), controller.saveEventMap);

module.exports = { templates, eventMaps };
