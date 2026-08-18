const mongoose = require("mongoose");

// A notification is stored per recipient. This makes the inbox naturally
// tenant-safe: a user can only ever query documents addressed to them.
const notificationSchema = new mongoose.Schema({
  recipientUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
  scope: { type: String, enum: ["personal", "organization"], default: "personal" },
  type: { type: String, required: true, trim: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  link: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Allows payment/webhook/browser confirmation retries to safely request the
  // same notification without creating duplicates.
  // Do not default this to null. A sparse unique MongoDB index still indexes
  // an explicit null value, which would allow only one notification without a
  // key per recipient. Undefined keeps normal notifications out of the index.
  dedupeKey: { type: String },
  readAt: { type: Date, default: null },
  dismissedAt: { type: Date, default: null },
}, { timestamps: true });

notificationSchema.index({ recipientUserId: 1, dismissedAt: 1, createdAt: -1 });
notificationSchema.index({ recipientUserId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index(
  { recipientUserId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $exists: true, $type: "string" } }
  }
);

module.exports = mongoose.model("Notification", notificationSchema);
