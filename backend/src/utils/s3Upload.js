const crypto = require("crypto");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../config/s3");

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const requiredConfiguration = ["AWS_REGION", "S3_BUCKET_NAME", "S3_PUBLIC_BASE_URL"];

const uploadBufferToS3 = async ({ buffer, mimetype, folder }) => {
  const missing = requiredConfiguration.filter((name) => !process.env[name]);
  if (missing.length) {
    const error = new Error(`S3 upload is not configured: missing ${missing.join(", ")}`);
    error.statusCode = 503;
    throw error;
  }

  const extension = MIME_EXTENSIONS[mimetype];
  if (!extension) {
    const error = new Error("Only JPEG, PNG, or WEBP images are allowed");
    error.statusCode = 400;
    throw error;
  }

  const safeFolder = String(folder || "uploads").replace(/[^a-z0-9/-]/gi, "").replace(/^\/+|\/+$/g, "");
  const key = `${safeFolder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    CacheControl: "public, max-age=31536000, immutable",
    ServerSideEncryption: "AES256",
  }));

  const baseUrl = process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, "");
  return { key, url: `${baseUrl}/${key}` };
};

module.exports = { uploadBufferToS3 };
