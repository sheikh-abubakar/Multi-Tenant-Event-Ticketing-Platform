const platformAdminService = require("../services/platformAdmin.service");

const run = (handler) => async (req, res) => { try { return await handler(req, res); } catch (error) { return res.status(error.statusCode || 500).json({ message: error.message || "Platform request failed" }); } };

const overview = run(async (req, res) => res.json(await platformAdminService.getOverview(req.query.range)));
const organizations = run(async (req, res) => res.json(await platformAdminService.listOrganizations(req.query)));
const organizationDetail = run(async (req, res) => res.json(await platformAdminService.getOrganizationDetail(req.params.organizationId, req.query.range)));
const updateOrganizationStatus = run(async (req, res) => res.json({ organization: await platformAdminService.setOrganizationStatus({ organizationId: req.params.organizationId, suspended: Boolean(req.body.suspended), reason: req.body.reason, actorUserId: req.user._id }) }));
const activity = run(async (req, res) => res.json(await platformAdminService.listActivity(req.query)));

module.exports = { overview, organizations, organizationDetail, updateOrganizationStatus, activity };
