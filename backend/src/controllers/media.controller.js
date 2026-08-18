const mediaService = require("../services/media.service");
const { notifyOrganization } = require("../services/notification.service");

const list = async (req, res) => {
  try {
    const assets = await mediaService.listAssets(req.organizationId, req.query.search);
    return res.json({ assets });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const upload = async (req, res) => {
  try {
    const asset = await mediaService.createAsset(req.organizationId, req.file);
    await notifyOrganization(req.organizationId, { type: "media.uploaded", title: "Media uploaded", message: `${req.user.name || req.user.email} uploaded ${asset.originalName || "a media file"}.`, link: `/o/${req.params.orgSlug}/manage/media`, metadata: { assetId: String(asset._id) } }, req.user._id);
    return res.status(201).json({ asset });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const result = await mediaService.deleteAsset(req.organizationId, req.params.assetId);
    await notifyOrganization(req.organizationId, { type: "media.deleted", title: "Media removed", message: `${req.user.name || req.user.email} removed a media item.`, link: `/o/${req.params.orgSlug}/manage/media`, metadata: { assetId: req.params.assetId } }, req.user._id);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = {
  list,
  upload,
  remove,
};
