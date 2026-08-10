const mongoose = require("mongoose");

const mediaAssetSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    key: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Compound index to speed up filtering by name within an organization
mediaAssetSchema.index({ organizationId: 1, originalName: 1 });

module.exports = mongoose.model("MediaAsset", mediaAssetSchema);
