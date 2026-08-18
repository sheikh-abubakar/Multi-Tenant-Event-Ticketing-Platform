const organizationService = require("../services/organization.service");
const { uploadBufferToS3 } = require("../utils/s3Upload");
const MediaAsset = require("../models/MediaAsset");
const { notifyOrganization, notifyPlatformAdmin } = require("../services/notification.service");
const { recordPlatformAudit } = require("../utils/platformAudit");

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
    await notifyOrganization(req.organizationId, { type: "organization.settings.updated", title: "Organization settings updated", message: `${req.user.name || req.user.email} updated ${organization.name}'s settings.`, link: `/o/${req.params.orgSlug}/manage/settings` }, req.user._id);
    return res.json({ organization });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const deleteOrganization = async (req, res) => {
  try {
    const organization = await organizationService.getOrganizationSettings(req.organizationId);
    await organizationService.softDeleteOrganization(req.organizationId);
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "organization.deleted", targetType: "organization", targetId: req.organizationId, metadata: { organizationName: organization.name } });
    await notifyPlatformAdmin({ type: "platform.organization.deleted", title: "Organization deleted", message: `${req.user.name || req.user.email} deleted ${organization.name}.`, organizationId: req.organizationId, link: "/platform-admin/organizations", metadata: { organizationId: String(req.organizationId), organizationName: organization.name }, dedupeKey: `platform-organization-deleted:${req.organizationId}` });
    return res.status(204).send();
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { getSettings, updateSettings, deleteOrganization };
