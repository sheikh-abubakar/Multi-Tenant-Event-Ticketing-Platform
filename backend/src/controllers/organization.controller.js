const organizationService = require("../services/organization.service");
const { recordPlatformAudit } = require("../utils/platformAudit");
const { notifyPlatformAdmin } = require("../services/notification.service");

/**
 * req.user is already attached here because this route runs behind
 * the `authenticate` middleware — we need to KNOW who is creating
 * this org so we can make them the owner.
 */
const create = async (req, res) => {
  try {
    const { name, slug } = req.body;
    const organization = await organizationService.createOrganization(
      { name, slug },
      req.user._id
    );
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: organization._id, action: "organization.created", targetType: "organization", targetId: organization._id, metadata: { organizationName: organization.name } });
    await notifyPlatformAdmin({ type: "platform.organization.created", title: "Organization created", message: `${req.user.name || req.user.email} created ${organization.name}.`, organizationId: organization._id, link: `/platform-admin/organizations/${organization._id}`, metadata: { organizationId: String(organization._id), organizationName: organization.name }, dedupeKey: `platform-organization-created:${organization._id}` });
    return res.status(201).json({ organization });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const listMine = async (req, res) => {
  try {
    const organizations = await organizationService.listMyOrganizations(req.user._id);
    return res.json({ organizations });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = { create, listMine };
