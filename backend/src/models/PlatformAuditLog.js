const mongoose = require("mongoose");

const platformAuditLogSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
    action: { type: String, required: true, trim: true, index: true },
    targetType: { type: String, required: true, trim: true },
    targetId: { type: String, required: true, trim: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

platformAuditLogSchema.index({ createdAt: -1 });
platformAuditLogSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.model("PlatformAuditLog", platformAuditLogSchema);
