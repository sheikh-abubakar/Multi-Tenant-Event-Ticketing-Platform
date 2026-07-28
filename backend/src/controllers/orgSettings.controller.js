const organizationService = require("../services/organization.service");
const { uploadBufferToS3 } = require("../utils/s3Upload");

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
    let logoUrl;
    if (req.file) {
      const result = await uploadBufferToS3({ buffer: req.file.buffer, mimetype: req.file.mimetype, folder: "org-logos" });
      logoUrl = result.url;
    }

    const organization = await organizationService.updateOrganizationSettings(
      req.organizationId,
      req.body,
      logoUrl,
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
