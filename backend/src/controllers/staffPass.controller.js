const mongoose = require("mongoose");
const crypto = require("crypto");
const QRCode = require("qrcode");
const StaffPass = require("../models/StaffPass");
const OrganizationMember = require("../models/OrganizationMember");
const User = require("../models/User");
const Event = require("../models/Event");
const EventBundle = require("../models/EventBundle");
const Venue = require("../models/Venue");
const { generatePassPDF } = require("../utils/pdfGenerator");
const emailService = require("../config/email");
const { notifyUser, notifyOrganization } = require("../services/notification.service");

const { encryptPayload, decryptPayload } = require("../utils/crypto");

// Helper to generate a unique pass code
const generatePassCode = () => {
  return `PASS-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
};

// 1. Create a Staff Pass in Draft state (Owner Only)
const createPass = async (req, res) => {
  try {
    const { userId, eventId, eventSessionId, passType } = req.body;
    const organizationId = req.organizationId;
    const targetType = "event";

    if (!userId || !eventId || !passType) {
      return res.status(400).json({ message: "userId, eventId, and passType are required" });
    }

    // Verify recipient is a member of the organization
    const member = await OrganizationMember.findOne({ userId, organizationId });
    if (!member) {
      return res.status(400).json({ message: "Selected user is not a member of this organization" });
    }

    // Verify event exists
    const event = await Event.findOne({ _id: eventId, organizationId });
    if (!event) return res.status(404).json({ message: "Event not found" });
    
    // If event has multiple sessions and a session was selected, verify it exists
    if (eventSessionId && event.sessions?.length) {
      const sessionExists = event.sessions.some(s => s._id.toString() === eventSessionId.toString());
      if (!sessionExists) return res.status(400).json({ message: "Selected event session not found" });
    }

    const confirmationCode = generatePassCode();

    const pass = await StaffPass.create({
      organizationId,
      userId,
      targetType,
      eventId,
      bundleId: null,
      eventSessionId: eventSessionId || null,
      passType,
      status: "draft",
      confirmationCode,
    });

    return res.status(201).json({ message: "Staff pass created as draft", pass });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// 2. Update a Draft Staff Pass (Owner Only)
const updatePass = async (req, res) => {
  try {
    const { passId } = req.params;
    const { userId, targetType, eventId, bundleId, eventSessionId, passType } = req.body;
    const organizationId = req.organizationId;

    const pass = await StaffPass.findOne({ _id: passId, organizationId });
    if (!pass) {
      return res.status(404).json({ message: "Staff pass not found" });
    }

    if (pass.status !== "draft") {
      return res.status(400).json({ message: "Only draft passes can be edited" });
    }

    if (userId) {
      const member = await OrganizationMember.findOne({ userId, organizationId });
      if (!member) {
        return res.status(400).json({ message: "Selected user is not a member of this organization" });
      }
      pass.userId = userId;
    }

    pass.targetType = "event";
    if (eventId) {
      const event = await Event.findOne({ _id: eventId, organizationId });
      if (!event) return res.status(404).json({ message: "Event not found" });
      
      // If event has multiple sessions and a session was selected, verify it exists
      if (eventSessionId && event.sessions?.length) {
        const sessionExists = event.sessions.some(s => s._id.toString() === eventSessionId.toString());
        if (!sessionExists) return res.status(400).json({ message: "Selected event session not found" });
      }
      pass.eventId = eventId;
      pass.eventSessionId = eventSessionId || null;
      pass.bundleId = null;
    }

    if (passType) {
      pass.passType = passType;
    }

    await pass.save();
    return res.json({ message: "Staff pass updated successfully", pass });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// 3. Delete a Draft or Revoked Staff Pass (Owner Only)
const deletePass = async (req, res) => {
  try {
    const { passId } = req.params;
    const organizationId = req.organizationId;

    const pass = await StaffPass.findOne({ _id: passId, organizationId });
    if (!pass) {
      return res.status(404).json({ message: "Staff pass not found" });
    }

    if (pass.status === "active") {
      return res.status(400).json({ message: "Active passes cannot be deleted, revoke them instead" });
    }

    await StaffPass.deleteOne({ _id: passId });
    return res.json({ message: "Staff pass deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// 4. Send / Publish Staff Pass (Owner Only)
const sendPass = async (req, res) => {
  try {
    const { passId } = req.params;
    const organizationId = req.organizationId;

    const pass = await StaffPass.findOne({ _id: passId, organizationId });
    if (!pass) {
      return res.status(404).json({ message: "Staff pass not found" });
    }

    if (pass.status !== "draft") {
      return res.status(400).json({ message: "Pass has already been sent/activated" });
    }

    // Generate secure encrypted QR Code payload to prevent Google Lens exposure
    const payload = {
      passId: pass._id.toString(),
      confirmationCode: pass.confirmationCode,
      type: "staff_pass",
    };
    const encryptedPayload = encryptPayload(payload);
    const qrCodeUrl = await QRCode.toDataURL(`staff_pass:${encryptedPayload}`);

    // Save QR Code and set status to active
    pass.qrCodeUrl = qrCodeUrl;
    pass.status = "active";
    await pass.save();

    // Fetch recipient user details
    const recipient = await User.findById(pass.userId).select("name email");
    if (!recipient) {
      return res.status(404).json({ message: "Recipient user not found" });
    }

    // Get Organization Details
    const Organization = require("../models/Organization");
    const org = await Organization.findById(organizationId).select("name slug");
    const orgName = org ? org.name : "Organization";

    // Load event or bundle target details
    let target = null;
    let eventsList = [];
    if (pass.targetType === "event") {
      target = await Event.findById(pass.eventId).populate("venueId", "name address city").lean();
      if (target && pass.eventSessionId && target.sessions?.length) {
        const session = target.sessions.find(s => s._id.toString() === pass.eventSessionId.toString());
        if (session) {
          target.dateTime = session.dateTime;
        }
      }
    } else {
      target = await EventBundle.findById(pass.bundleId).lean();
      if (target && target.eventIds?.length) {
        eventsList = await Event.find({ _id: { $in: target.eventIds } }).populate("venueId", "name address city").lean();
      }
    }

    if (!target) {
      return res.status(404).json({ message: "Pass target (event or bundle) not found" });
    }

    // Generate PDF Pass Attachment
    const pdfBuffer = await generatePassPDF(pass, recipient, orgName, target, eventsList);

    // Send Email to recipient with PDF attachment
    try {
      await emailService.sendStaffPass(pass, recipient, orgName, target, eventsList, pdfBuffer);
    } catch (emailErr) {
      console.error("Failed to send staff pass email:", emailErr.message);
    }

    // Send Dashboard Notifications
    await notifyUser(pass.userId, {
      type: "staff_pass.issued",
      title: "New Staff Pass Issued",
      message: `You have been issued a ${pass.passType} for ${target.name} by ${orgName}.`,
      link: "/my/passes",
      metadata: { passId: pass._id.toString() },
    });

    await notifyOrganization(
      organizationId,
      {
        type: "staff_pass.issued",
        title: "Staff Pass Dispatched",
        message: `Pass for ${recipient.name} (${pass.passType}) has been sent.`,
        link: `/o/${org.slug}/manage/passes`,
        metadata: { passId: pass._id.toString() },
      },
      req.user._id
    );

    return res.json({ message: "Staff pass sent successfully", pass });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// 5. Get Organization Passes (Owner Only)
const getOrgPasses = async (req, res) => {
  try {
    const organizationId = req.organizationId;
    const passes = await StaffPass.find({ organizationId })
      .populate("userId", "name email")
      .populate("eventId", "name dateTime venueId sessions")
      .populate("bundleId", "name")
      .sort({ createdAt: -1 });

    return res.json({ passes });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// 6. Get Logged-In User's Passes (Buyer Hub Wallet)
const getUserPasses = async (req, res) => {
  try {
    const userId = req.user._id;
    const passes = await StaffPass.find({ userId, status: "active" })
      .populate("organizationId", "name slug")
      .populate("eventId", "name dateTime venueId timezone sessions")
      .populate("bundleId", "name eventIds")
      .lean();

    // For any bundle pass, attach details of all events included in the bundle
    for (const pass of passes) {
      if (pass.targetType === "bundle" && pass.bundleId && pass.bundleId.eventIds?.length) {
        const events = await Event.find({ _id: { $in: pass.bundleId.eventIds } })
          .populate("venueId", "name city")
          .select("name dateTime venueId timezone")
          .lean();
        pass.bundleEvents = events;
      }
    }

    return res.json({ passes });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// 7. Verify Pass at Entrance (Owner Only)
const verifyPass = async (req, res) => {
  try {
    const { passId } = req.params;
    const organizationId = req.organizationId;

    // Strict constraint check: Only the Owner role of the organization can verify/scan passes
    const requesterMember = await OrganizationMember.findOne({ userId: req.user._id, organizationId });
    if (!requesterMember || requesterMember.role !== "owner") {
      return res.status(403).json({ message: "Verification failed: Only the organization Owner is authorized to scan and verify staff passes." });
    }

    const pass = await StaffPass.findOne({ _id: passId, organizationId });
    if (!pass) {
      return res.status(404).json({ message: "Pass not found or invalid" });
    }

    if (pass.status === "verified") {
      return res.status(400).json({ message: "Verification failed: This staff pass has already been used and verified." });
    }

    if (pass.status !== "active") {
      return res.status(400).json({ message: `This staff pass is currently ${pass.status}` });
    }

    // Fetch target details
    let targetName = "";
    let sessionDetails = "";
    if (pass.targetType === "event") {
      const event = await Event.findById(pass.eventId).lean();
      if (event) {
        targetName = event.name;
        let displayDate = event.dateTime;
        if (pass.eventSessionId && event.sessions?.length) {
          const matchedSession = event.sessions.find(s => s._id.toString() === pass.eventSessionId.toString());
          if (matchedSession) {
            displayDate = matchedSession.dateTime;
          }
        }
        sessionDetails = new Date(displayDate).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } else {
      const bundle = await EventBundle.findById(pass.bundleId).lean();
      if (bundle) targetName = `Bundle: ${bundle.name}`;
    }

    const holder = await User.findById(pass.userId).select("name email");
    if (!holder) {
      return res.status(404).json({ message: "Pass holder user details not found" });
    }

    // Mark pass as verified/used and save
    pass.status = "verified";
    await pass.save();

    // Invalidate analytics cache so verified pass details show up instantly on dashboard
    try {
      const { invalidateOrgCache } = require("../services/analytics.service");
      invalidateOrgCache(organizationId);
    } catch (cacheErr) {
      console.error("Failed to invalidate analytics cache:", cacheErr.message);
    }

    return res.json({
      message: "Staff Check-in Approved!",
      passType: pass.passType,
      userName: holder.name,
      userEmail: holder.email,
      targetName,
      sessionDetails,
      pass,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const verifyScanned = async (req, res) => {
  try {
    const { scannedData } = req.body;
    const organizationId = req.organizationId;

    // Strict constraint check: Only the Owner role of the organization can verify/scan passes
    const requesterMember = await OrganizationMember.findOne({ userId: req.user._id, organizationId });
    if (!requesterMember || requesterMember.role !== "owner") {
      return res.status(403).json({ message: "Verification failed: Only the organization Owner is authorized to scan and verify staff passes." });
    }

    if (!scannedData) {
      return res.status(400).json({ message: "scannedData is required" });
    }

    let passId = "";
    let confirmationCode = "";

    if (scannedData.startsWith("staff_pass:")) {
      const ciphertext = scannedData.substring("staff_pass:".length);
      const decrypted = decryptPayload(ciphertext);
      passId = decrypted.passId;
      confirmationCode = decrypted.confirmationCode;
    } else {
      // Backward compatibility fallback for unencrypted legacy codes (JSON)
      try {
        const decrypted = JSON.parse(scannedData);
        if (decrypted && decrypted.type === "staff_pass") {
          passId = decrypted.passId;
          confirmationCode = decrypted.confirmationCode;
        } else {
          return res.status(400).json({ message: "Invalid pass QR code format" });
        }
      } catch (e) {
        return res.status(400).json({ message: "Failed to parse scanned pass data" });
      }
    }

    if (!passId || !confirmationCode) {
      return res.status(400).json({ message: "Invalid or missing parameters in scanned QR" });
    }

    const pass = await StaffPass.findOne({ _id: passId, organizationId });
    if (!pass) {
      return res.status(404).json({ message: "Pass not found or invalid" });
    }

    if (pass.confirmationCode !== confirmationCode) {
      return res.status(400).json({ message: "Verification failed: Confirmation code mismatch." });
    }

    if (pass.status === "verified") {
      return res.status(400).json({ message: "Verification failed: This staff pass has already been used and verified." });
    }

    if (pass.status !== "active") {
      return res.status(400).json({ message: `This staff pass is currently ${pass.status}` });
    }

    // Fetch target details
    let targetName = "";
    let sessionDetails = "";
    if (pass.targetType === "event") {
      const event = await Event.findById(pass.eventId).lean();
      if (event) {
        targetName = event.name;
        let displayDate = event.dateTime;
        if (pass.eventSessionId && event.sessions?.length) {
          const matchedSession = event.sessions.find(s => s._id.toString() === pass.eventSessionId.toString());
          if (matchedSession) {
            displayDate = matchedSession.dateTime;
          }
        }
        sessionDetails = new Date(displayDate).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } else {
      const bundle = await EventBundle.findById(pass.bundleId).lean();
      if (bundle) targetName = `Bundle: ${bundle.name}`;
    }

    const holder = await User.findById(pass.userId).select("name email");
    if (!holder) {
      return res.status(404).json({ message: "Pass holder user details not found" });
    }

    // Mark pass as verified/used and save
    pass.status = "verified";
    await pass.save();

    // Invalidate analytics cache so verified pass details show up instantly on dashboard
    try {
      const { invalidateOrgCache } = require("../services/analytics.service");
      invalidateOrgCache(organizationId);
    } catch (cacheErr) {
      console.error("Failed to invalidate analytics cache:", cacheErr.message);
    }

    return res.json({
      message: "Staff Check-in Approved!",
      passType: pass.passType,
      userName: holder.name,
      userEmail: holder.email,
      targetName,
      sessionDetails,
      pass,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createPass,
  updatePass,
  deletePass,
  sendPass,
  getOrgPasses,
  getUserPasses,
  verifyPass,
  verifyScanned,
};
