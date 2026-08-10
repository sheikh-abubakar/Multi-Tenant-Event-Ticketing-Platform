const EventBundle = require("../models/EventBundle");
const Event = require("../models/Event");
const { uploadBufferToS3 } = require("../utils/s3Upload");

const buildBannerUrl = async (req) => {
  if (!req.file) return undefined;
  const result = await uploadBufferToS3({
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    folder: "event-banners",
  });
  return result.url;
};

const create = async (req, res) => {
  try {
    const { name, description, venueId, eventIds, pricePerSeat, accessCode, privateCodeExpiry, allowedSections } = req.body;

    let parsedEventIds = eventIds;
    if (typeof eventIds === "string") {
      try {
        parsedEventIds = JSON.parse(eventIds);
      } catch (e) {
        parsedEventIds = eventIds.split(",").map((id) => id.trim());
      }
    }

    let parsedAllowedSections = allowedSections;
    if (typeof allowedSections === "string") {
      try {
        parsedAllowedSections = JSON.parse(allowedSections);
      } catch (e) {
        parsedAllowedSections = [];
      }
    }

    if (!name || !venueId || !parsedEventIds || !Array.isArray(parsedEventIds) || parsedEventIds.length < 2) {
      return res.status(400).json({ message: "Name, venueId, and at least two eventIds are required." });
    }

    if (pricePerSeat === undefined || Number(pricePerSeat) < 0) {
      return res.status(400).json({ message: "A valid positive pricePerSeat is required." });
    }

    // Verify all events exist, belong to this organization, and are at the same venue
    const events = await Event.find({
      _id: { $in: parsedEventIds },
      organizationId: req.organizationId,
    });

    if (events.length !== parsedEventIds.length) {
      return res.status(400).json({ message: "One or more selected events do not exist or belong to another organization." });
    }

    const mismatchVenue = events.some((evt) => evt.venueId.toString() !== venueId);
    if (mismatchVenue) {
      return res.status(400).json({ message: "All events in the bundle must be scheduled at the selected venue." });
    }

    const bannerImageUrl = await buildBannerUrl(req);

    const bundle = new EventBundle({
      organizationId: req.organizationId,
      venueId,
      name,
      description,
      eventIds: parsedEventIds,
      pricePerSeat: Number(pricePerSeat),
      bannerImageUrl: bannerImageUrl || null,
      accessCode: accessCode ? String(accessCode).trim() || null : null,
      privateCodeExpiry: privateCodeExpiry ? new Date(privateCodeExpiry) || null : null,
      allowedSections: Array.isArray(parsedAllowedSections) ? parsedAllowedSections : [],
    });

    await bundle.save();
    return res.status(201).json({ bundle });
  } catch (error) {
    console.error("Create bundle failed:", error);
    return res.status(500).json({ message: error.message });
  }
};

const listPublic = async (req, res) => {
  try {
    const bundles = await EventBundle.find({ organizationId: req.organizationId })
      .populate("eventIds", "name dateTime bannerImageUrl selectedSeatMap purchaseMode")
      .populate("venueId", "name city address")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ bundles });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getOne = async (req, res) => {
  try {
    const clientBundleCode = (req.headers["x-bundle-access-code"] || req.query.bundleAccessCode || "").trim();
    const clientEventCode = (req.headers["x-event-access-code"] || req.query.accessCode || "").trim();

    const bundle = await EventBundle.findOne({
      _id: req.params.bundleId,
      organizationId: req.organizationId,
    })
      .populate({
        path: "eventIds",
        select: "name description dateTime bannerImageUrl selectedSeatMap purchaseMode venueId accessCode privateCodeExpiry",
        populate: { path: "venueId", select: "name city address" }
      })
      .populate("venueId", "name city address seatmaps")
      .lean();

    if (!bundle) {
      return res.status(404).json({ message: "Event bundle not found." });
    }

    // Check if the bundle is protected
    const isBundleProtected = bundle.accessCode && (!bundle.privateCodeExpiry || new Date(bundle.privateCodeExpiry) > new Date());
    if (isBundleProtected) {
      const isUnlocked = clientBundleCode === bundle.accessCode;
      if (!isUnlocked) {
        const lockedBundle = {
          _id: bundle._id,
          name: bundle.name,
          description: bundle.description,
          venueId: bundle.venueId,
          pricePerSeat: bundle.pricePerSeat,
          bannerImageUrl: bundle.bannerImageUrl,
          isProtected: true,
          privateCodeExpiry: bundle.privateCodeExpiry,
        };
        return res.json({ bundle: lockedBundle });
      }
    }

    // Unlocked or public bundle: process eventIds for event-level protection
    const isBundleUnlocked = isBundleProtected && clientBundleCode === bundle.accessCode;
    const cleanEventIds = (bundle.eventIds || []).map((event) => {
      const cleanEvt = { ...event };
      const isEventProtected = cleanEvt.accessCode && (!cleanEvt.privateCodeExpiry || new Date(cleanEvt.privateCodeExpiry) > new Date());
      if (isEventProtected) {
        // Unlocked if either bundle is unlocked (Case 2) or direct event code matches
        const isUnlocked = (!isBundleProtected) || isBundleUnlocked || (clientEventCode === cleanEvt.accessCode);
        cleanEvt.isProtected = !isUnlocked;
      } else {
        cleanEvt.isProtected = false;
      }
      delete cleanEvt.accessCode; // Remove for security
      return cleanEvt;
    });

    const cleanBundle = { ...bundle, eventIds: cleanEventIds };
    delete cleanBundle.accessCode;
    cleanBundle.isProtected = false;

    return res.json({ bundle: cleanBundle });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const { name, description, venueId, eventIds, pricePerSeat, accessCode, privateCodeExpiry, allowedSections } = req.body;

    const bundle = await EventBundle.findOne({
      _id: req.params.bundleId,
      organizationId: req.organizationId,
    });

    if (!bundle) {
      return res.status(404).json({ message: "Event bundle not found." });
    }

    let parsedEventIds = eventIds;
    if (typeof eventIds === "string") {
      try {
        parsedEventIds = JSON.parse(eventIds);
      } catch (e) {
        parsedEventIds = eventIds.split(",").map((id) => id.trim());
      }
    }

    if (name) bundle.name = name;
    if (description !== undefined) bundle.description = description;
    if (pricePerSeat !== undefined) bundle.pricePerSeat = Number(pricePerSeat);
    if (accessCode !== undefined) {
      bundle.accessCode = accessCode ? String(accessCode).trim() || null : null;
    }
    if (privateCodeExpiry !== undefined) {
      bundle.privateCodeExpiry = privateCodeExpiry ? new Date(privateCodeExpiry) || null : null;
    }

    if (allowedSections !== undefined) {
      let parsedAllowedSections = allowedSections;
      if (typeof allowedSections === "string") {
        try {
          parsedAllowedSections = JSON.parse(allowedSections);
        } catch (e) {
          parsedAllowedSections = [];
        }
      }
      bundle.allowedSections = Array.isArray(parsedAllowedSections) ? parsedAllowedSections : [];
    }

    if (venueId && parsedEventIds && Array.isArray(parsedEventIds) && parsedEventIds.length >= 2) {
      // Verify venue mismatch & event access
      const events = await Event.find({
        _id: { $in: parsedEventIds },
        organizationId: req.organizationId,
      });

      if (events.length !== parsedEventIds.length) {
        return res.status(400).json({ message: "One or more selected events do not exist or belong to another organization." });
      }

      const mismatchVenue = events.some((evt) => evt.venueId.toString() !== venueId);
      if (mismatchVenue) {
        return res.status(400).json({ message: "All events in the bundle must be scheduled at the selected venue." });
      }

      bundle.venueId = venueId;
      bundle.eventIds = parsedEventIds;
    }

    const newBannerUrl = await buildBannerUrl(req);
    if (newBannerUrl) {
      bundle.bannerImageUrl = newBannerUrl;
    }

    await bundle.save();
    return res.json({ bundle });
  } catch (error) {
    console.error("Update bundle failed:", error);
    return res.status(500).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const result = await EventBundle.deleteOne({
      _id: req.params.bundleId,
      organizationId: req.organizationId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "Event bundle not found." });
    }

    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const checkout = async (req, res) => {
  try {
    const bookingService = require("../services/booking.service");
    const result = await bookingService.createBundleCheckout(
      req.params.bundleId,
      req.organizationId,
      req.params.orgSlug,
      { ...req.body, userId: req.user?._id }
    );
    return res.status(201).json(result);
  } catch (error) {
    console.error("Bundle checkout initiation failed:", error);
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getOneManage = async (req, res) => {
  try {
    const bundle = await EventBundle.findOne({
      _id: req.params.bundleId,
      organizationId: req.organizationId,
    })
      .populate("eventIds")
      .populate("venueId", "name city address seatmaps")
      .lean();

    if (!bundle) {
      return res.status(404).json({ message: "Event bundle not found." });
    }

    return res.json({ bundle });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const verifyAccess = async (req, res) => {
  try {
    const { accessCode } = req.body;
    if (!accessCode) {
      return res.status(400).json({ message: "Access code is required." });
    }
    const bundle = await EventBundle.findOne({
      _id: req.params.bundleId,
      organizationId: req.organizationId,
    });
    if (!bundle) {
      return res.status(404).json({ message: "Bundle not found." });
    }
    if (!bundle.accessCode) {
      return res.json({ success: true, message: "Bundle is not private." });
    }
    if (accessCode.trim() !== bundle.accessCode.trim()) {
      return res.status(403).json({ message: "Invalid access code." });
    }
    return res.json({ success: true, message: "Access code verified." });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { create, listPublic, getOne, getOneManage, update, remove, checkout, verifyAccess };
