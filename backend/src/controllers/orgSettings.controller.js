const organizationService = require("../services/organization.service");
const { uploadBufferToS3 } = require("../utils/s3Upload");
const MediaAsset = require("../models/MediaAsset");

const getSettings = async (req, res) => {
  try {
    const organization = await organizationService.getOrganizationSettings(req.organizationId);
    return res.json({ organization });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const updateSettings = async (req, res) => {
  try {
    let logoUrl = req.body.logoUrl;
    if (req.file) {
      const result = await uploadBufferToS3({ buffer: req.file.buffer, mimetype: req.file.mimetype, folder: "org-logos" });
      logoUrl = result.url;

      try {
        await MediaAsset.create({
          organizationId: req.organizationId,
          originalName: req.file.originalname || "unnamed-image",
          mimeType: req.file.mimetype,
          key: result.key,
          url: result.url,
          size: req.file.size || 0,
        });
      } catch (err) {
        console.error("Auto-saving media asset failed:", err.message);
      }
    }

    const organization = await organizationService.updateOrganizationSettings(
      req.organizationId,
      req.body,
      logoUrl
    );
    return res.json({ organization });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const deleteOrganization = async (req, res) => {
  try {
    await organizationService.softDeleteOrganization(req.organizationId);
    return res.status(204).send();
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { getSettings, updateSettings, deleteOrganization };
