const venueService = require("../services/venue.service");
const { notifyOrganization } = require("../services/notification.service");

const create = async (req, res) => {
  try {
    const venue = await venueService.createVenue(req.body, req.organizationId);
    await notifyOrganization(req.organizationId, { type: "venue.created", title: "Venue created", message: `${req.user.name || req.user.email} created ${venue.name}.`, link: `/o/${req.params.orgSlug}/manage/venues`, metadata: { venueId: String(venue._id) } }, req.user._id);
    return res.status(201).json({ venue });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const list = async (req, res) => {
  try {
    const venues = await venueService.listVenues(req.organizationId, req.assignedVenueIds);
    return res.json({ venues });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getOne = async (req, res) => {
  try {
    const venue = await venueService.getVenueById(req.params.venueId, req.organizationId);
    return res.json({ venue });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const venue = await venueService.updateVenue(
      req.params.venueId,
      req.organizationId,
      req.body
    );
    await notifyOrganization(req.organizationId, { type: "venue.updated", title: "Venue updated", message: `${req.user.name || req.user.email} updated ${venue.name}.`, link: `/o/${req.params.orgSlug}/manage/venues`, metadata: { venueId: String(venue._id) } }, req.user._id);
    return res.json({ venue });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const venue = await venueService.getVenueById(req.params.venueId, req.organizationId);
    await venueService.deleteVenue(req.params.venueId, req.organizationId);
    await notifyOrganization(req.organizationId, { type: "venue.deleted", title: "Venue removed", message: `${req.user.name || req.user.email} removed ${venue?.name || "a venue"}.`, link: `/o/${req.params.orgSlug}/manage/venues`, metadata: { venueId: req.params.venueId } }, req.user._id);
    return res.status(204).send();
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { create, list, getOne, update, remove };
