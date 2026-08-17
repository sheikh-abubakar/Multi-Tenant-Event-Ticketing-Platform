const seatChangeService = require("../services/seatChange.service");
const { notifyOrganizationBookingUpdate } = require("../services/organizationUpdate.service");

const createRequest = async (req, res) => {
  try {
    const result = await seatChangeService.createRequest(
      req.user._id,
      req.organizationId,
      req.body,
      {
        orgSlug: req.params.orgSlug,
        protocol: req.protocol,
        host: req.get("host"),
      }
    );
    notifyOrganizationBookingUpdate(req.organizationId, { type: "seat-change-created", bookingId: result.request?.bookingId?.toString(), requestId: result.request?._id?.toString() });
    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getMyRequests = async (req, res) => {
  try {
    const requests = await seatChangeService.getMyRequests(req.user._id, req.organizationId);
    return res.json({ requests });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getPendingRequests = async (req, res) => {
  try {
    const requests = await seatChangeService.getPendingRequests(req.organizationId);
    return res.json({ requests });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const approveRequest = async (req, res) => {
  try {
    const request = await seatChangeService.approveRequest(req.params.requestId, req.organizationId);
    notifyOrganizationBookingUpdate(req.organizationId, { type: "seat-change-approved", bookingId: request.bookingId.toString(), requestId: request._id.toString() });
    return res.json({ message: "Seat change approved successfully", request });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const rejectRequest = async (req, res) => {
  try {
    const request = await seatChangeService.rejectRequest(req.params.requestId, req.organizationId);
    notifyOrganizationBookingUpdate(req.organizationId, { type: "seat-change-rejected", bookingId: request.bookingId.toString(), requestId: request._id.toString() });
    return res.json({ message: "Seat change rejected successfully", request });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const devSimulatePay = async (req, res) => {
  try {
    const request = await seatChangeService.devSimulatePay(req.params.requestId, req.organizationId);
    notifyOrganizationBookingUpdate(req.organizationId, { type: "seat-change-payment-updated", bookingId: request.bookingId.toString(), requestId: request._id.toString() });
    return res.json({ message: "Offline/dev payment simulated successfully", request });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getMyRequestsGlobal = async (req, res) => {
  try {
    const requests = await seatChangeService.getMyRequestsGlobal(req.user._id);
    return res.json({ requests });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = {
  createRequest,
  getMyRequests,
  getMyRequestsGlobal,
  getPendingRequests,
  approveRequest,
  rejectRequest,
  devSimulatePay,
};
