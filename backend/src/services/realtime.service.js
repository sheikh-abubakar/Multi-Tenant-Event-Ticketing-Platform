const { Server } = require("socket.io");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");
const { verifyToken } = require("../utils/jwt");
const { hasPermission } = require("../utils/permissions");
const { logger } = require("../config/logger");

let io;

const allowedOrigins = () => (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

const initializeRealtime = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigins(), credentials: true },
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Authentication required"));
      socket.userId = verifyToken(token).userId;
      return next();
    } catch {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    // Personal room is deliberately not client-selectable: JWT identity decides it.
    socket.join(`notification-user:${socket.userId}`);
    socket.on("analytics:join", async ({ orgSlug } = {}, acknowledge = () => {}) => {
      try {
        const organization = await Organization.findOne({ slug: String(orgSlug || "").toLowerCase(), isDeleted: { $ne: true } }).select("_id").lean();
        if (!organization) return acknowledge({ ok: false, message: "Organization not found" });

        const membership = await OrganizationMember.findOne({ userId: socket.userId, organizationId: organization._id }).lean();
        if (!membership || !hasPermission("settings:read", membership.permissions || [])) {
          return acknowledge({ ok: false, message: "Not authorized for analytics updates" });
        }

        socket.join(`analytics-org:${organization._id}`);
        acknowledge({ ok: true });
      } catch (error) {
        logger.warn("Realtime analytics room join failed", { error: error.message, userId: socket.userId, orgSlug });
        acknowledge({ ok: false, message: "Could not join analytics updates" });
      }
    });
  });

  logger.info("Realtime server ready");
  return io;
};

const emitOrganizationBookingUpdate = (organizationId, payload = {}) => {
  if (!io || !organizationId) return;
  io.to(`analytics-org:${organizationId}`).emit("analytics:booking-updated", {
    organizationId: organizationId.toString(),
    occurredAt: new Date().toISOString(),
    ...payload,
  });
};

const emitNotificationToUser = (userId, notification) => {
  if (!io || !userId) return;
  io.to(`notification-user:${userId}`).emit("notifications:new", notification);
};

module.exports = { initializeRealtime, emitOrganizationBookingUpdate, emitNotificationToUser };
