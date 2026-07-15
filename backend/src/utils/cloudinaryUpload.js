const { Readable } = require("stream");
const cloudinary = require("../config/cloudinary");

/**
 * Uploads a file that's held in memory (a Buffer — see
 * middlewares/upload.js, which now uses multer's memoryStorage
 * instead of writing to local disk) directly to Cloudinary.
 *
 * We never touch the local filesystem for uploaded images anymore —
 * the file exists only in RAM for the duration of this request,
 * then gets streamed straight to Cloudinary.
 */
const uploadBufferToCloudinary = (buffer, folder) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream({ folder }, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });

    Readable.from(buffer).pipe(uploadStream);
  });
};

module.exports = { uploadBufferToCloudinary };
