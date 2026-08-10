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

    const isEventProtected = event.accessCode && (!event.privateCodeExpiry || new Date(event.privateCodeExpiry) > new Date());
    if (isEventProtected) {
      const eventCode = (req.headers["x-event-access-code"] || req.query.accessCode || "").trim();
      const bundleCode = (req.headers["x-bundle-access-code"] || req.query.bundleAccessCode || "").trim();
      const queryBookingId = req.query.bookingId || req.headers["x-booking-id"];

      let unlocked = false;

      // 1. Check direct event access code
      if (eventCode && eventCode === event.accessCode) {
        unlocked = true;
      }

      // 2. Check if accessed via an unlocked bundle (Case 1 & 2)
      const queryBundleId = req.query.bundleId || req.headers["x-bundle-id"];
      if (!unlocked && (queryBundleId || bundleCode)) {
        let bundleFilter = { eventIds: event._id, organizationId: req.organizationId };
        if (queryBundleId) {
          bundleFilter._id = queryBundleId;
        } else {
          bundleFilter.accessCode = bundleCode;
        }
        const bundle = await EventBundle.findOne(bundleFilter);
        if (bundle) {
          const isBundleProtected = bundle.accessCode && (!bundle.privateCodeExpiry || new Date(bundle.privateCodeExpiry) > new Date());
          if (!isBundleProtected) {
            unlocked = true;
          } else if (bundleCode && bundleCode === bundle.accessCode) {
            unlocked = true;
          }
        }
      }

      // 3. Bypass if the user has a confirmed booking for this event
      if (!unlocked) {
        const Booking = require("../models/Booking");
        let bookingExists = false;

        if (queryBookingId) {
          const booking = await Booking.findOne({
            _id: queryBookingId,
            eventId: event._id,
            status: "confirmed"
          });
          if (booking) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith("Bearer ")) {
              try {
                const { verifyToken } = require("../utils/jwt");
                const User = require("../models/User");
                const token = authHeader.split(" ")[1];
                const decoded = verifyToken(token);
                if (decoded && decoded.userId) {
                  const dbUser = await User.findById(decoded.userId).lean();
                  const userEmail = (dbUser?.email || "").toLowerCase();
                  const isOwner = (booking.userId && String(booking.userId) === String(decoded.userId)) ||
                                  (booking.buyerEmail && booking.buyerEmail.toLowerCase() === userEmail);
                  if (isOwner) {
                    bookingExists = true;
                  }
                }
              } catch (e) {
                // Ignore token verify error
              }
            } else {
              bookingExists = true;
            }
          }
        }

        if (!bookingExists) {
          const authHeader = req.headers.authorization;
          if (authHeader && authHeader.startsWith("Bearer ")) {
            try {
              const { verifyToken } = require("../utils/jwt");
              const User = require("../models/User");
              const token = authHeader.split(" ")[1];
              const decoded = verifyToken(token);
              if (decoded && decoded.userId) {
                const dbUser = await User.findById(decoded.userId).lean();
                const userEmail = (dbUser?.email || "").toLowerCase();
                const booking = await Booking.findOne({
                  $or: [
                    { userId: decoded.userId },
                    { buyerEmail: userEmail }
                  ],
                  eventId: event._id,
                  status: "confirmed"
                });
                if (booking) {
                  bookingExists = true;
                }
              }
            } catch (e) {
              // Ignore token verify error
            }
          }
        }

        if (bookingExists) {
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

    let sessionId = req.query.sessionId;
    if (!sessionId && (req.query.bookingId || req.headers["x-booking-id"])) {
      const Booking = require("../models/Booking");
      const booking = await Booking.findById(req.query.bookingId || req.headers["x-booking-id"]);
      if (booking) {
        sessionId = booking.sessionId;
      }
    }
    const seatmap = await seatmapService.getEventSeatmap(req.params.eventId, req.organizationId, sessionId);
    return res.json({ seatmap });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};
const saveEventMap = respond(async (req) => ({ seatmap: await seatmapService.saveEventSeatmap(req.params.eventId, req.organizationId, req.body.seatmap || req.body, req.query.sessionId || req.body.sessionId) }));
const seedEventMap = respond(async (req) => ({ seatmap: await seatmapService.seedEventSeatmapFromTemplate(req.params.eventId, req.organizationId, req.body.seatmapId, req.body.sessionId) }));

module.exports = { listTemplates, createTemplate, updateTemplate, removeTemplate, getEventMap, saveEventMap, seedEventMap };
