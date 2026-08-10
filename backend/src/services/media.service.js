const MediaAsset = require("../models/MediaAsset");
const { uploadBufferToS3 } = require("../utils/s3Upload");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../config/s3");

const listAssets = async (organizationId, search = "") => {
  const query = { organizationId };

  if (search && search.trim() !== "") {
    query.originalName = { $regex: String(search).trim(), $options: "i" };
  }

  const assets = await MediaAsset.find(query).sort({ createdAt: -1 });
  return assets;
};

const createAsset = async (organizationId, file) => {
  if (!file) {
    const error = new Error("No file provided");
    error.statusCode = 400;
    throw error;
  }

  const uploadRes = await uploadBufferToS3({
    buffer: file.buffer,
    mimetype: file.mimetype,
    folder: "media-gallery",
  });

  const asset = await MediaAsset.create({
    organizationId,
    originalName: file.originalname || "unnamed-image",
    mimeType: file.mimetype,
    key: uploadRes.key,
    url: uploadRes.url,
    size: file.size || 0,
  });

  return asset;
};

const deleteAsset = async (organizationId, assetId) => {
  const asset = await MediaAsset.findOne({ _id: assetId, organizationId });
  if (!asset) {
    const error = new Error("Media asset not found");
    error.statusCode = 404;
    throw error;
  }

  // Try to delete from S3
  try {
    if (process.env.S3_BUCKET_NAME) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: asset.key,
        })
      );
    }
  } catch (s3Err) {
    console.error(`Failed to delete S3 object for key ${asset.key}:`, s3Err.message);
  }

  await MediaAsset.deleteOne({ _id: assetId });
  return { success: true };
};

module.exports = {
  listAssets,
  createAsset,
  deleteAsset,
};
