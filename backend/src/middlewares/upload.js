const multer = require("multer");

/**
 * memoryStorage: the uploaded file is kept in RAM as a Buffer
 * (available at req.file.buffer) instead of being written to local
 * disk. The controller then streams that buffer straight to
 * Cloudinary (see utils/cloudinaryUpload.js) — the file never
 * touches this server's filesystem at all.
 */
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, or WEBP images are allowed"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
});

module.exports = upload;
