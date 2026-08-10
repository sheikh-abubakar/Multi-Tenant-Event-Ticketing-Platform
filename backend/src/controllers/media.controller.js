const mediaService = require("../services/media.service");

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
    return res.status(201).json({ asset });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    const result = await mediaService.deleteAsset(req.organizationId, req.params.assetId);
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
