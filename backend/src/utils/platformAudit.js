const PlatformAuditLog = require("../models/PlatformAuditLog");

const recordPlatformAudit = async ({ actorUserId = null, organizationId = null, action, targetType, targetId, metadata = {} }) => {
  try {
    await PlatformAuditLog.create({ actorUserId, organizationId, action, targetType, targetId: String(targetId), metadata });
  } catch (error) {
    // Audit persistence must not make a successful business action fail.
    console.error("Platform audit log failed:", error.message);
  }
};

module.exports = { recordPlatformAudit };
