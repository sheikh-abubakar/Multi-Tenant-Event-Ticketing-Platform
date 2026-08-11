const express = require("express");
const authenticate = require("../middlewares/authenticate");
const resolveTenant = require("../middlewares/resolveTenant");
const loadMembership = require("../middlewares/loadMembership");
const checkPermission = require("../middlewares/checkPermission");
const seatChangeController = require("../controllers/seatChange.controller");

const router = express.Router({ mergeParams: true });

// Buyer endpoints
router.post("/requests", authenticate, resolveTenant, seatChangeController.createRequest);
router.get("/requests/my", authenticate, resolveTenant, seatChangeController.getMyRequests);

// Organizer/Admin management endpoints
router.get(
  "/requests/manage",
  authenticate,
  resolveTenant,
  loadMembership,
  checkPermission("seatchange:update"),
  seatChangeController.getPendingRequests
);

router.post(
  "/requests/:requestId/approve",
  authenticate,
  resolveTenant,
  loadMembership,
  checkPermission("seatchange:update"),
  seatChangeController.approveRequest
);

router.post(
  "/requests/:requestId/reject",
  authenticate,
  resolveTenant,
  loadMembership,
  checkPermission("seatchange:update"),
  seatChangeController.rejectRequest
);

router.post(
  "/requests/:requestId/dev-simulate-pay",
  authenticate,
  resolveTenant,
  seatChangeController.devSimulatePay
);

module.exports = router;
