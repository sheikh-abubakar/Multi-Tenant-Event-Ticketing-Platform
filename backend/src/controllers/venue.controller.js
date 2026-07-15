const venueService = require("../services/venue.service");

const create = async (req, res) => {
  try {
    const venue = await venueService.createVenue(req.body, req.organizationId);
    return res.status(201).json({ venue });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const list = async (req, res) => {
  try {
    const venues = await venueService.listVenues(req.organizationId);
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
    return res.json({ venue });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    await venueService.deleteVenue(req.params.venueId, req.organizationId);
    return res.status(204).send();
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { create, list, getOne, update, remove };
