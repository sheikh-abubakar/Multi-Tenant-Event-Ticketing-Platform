const teamService = require("../services/team.service");
const Organization = require("../models/Organization");
const { recordPlatformAudit } = require("../utils/platformAudit");

/**
 * GET /api/o/:orgSlug/team
 * Lists all members with permissions.
 */
const getMembers = async (req, res) => {
  try {
    const members = await teamService.getMembers(req.organizationId);
    return res.json({ members });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

/**
 * POST /api/o/:orgSlug/team/invite
 * Invite a new member. Body: { email, role, password? }
 * - Admin: password IS required, created immediately
 * - Staff: password NOT required, email sent with magic link
 */
const inviteMember = async (req, res) => {
  try {
    const { email, role, password } = req.body;

    // Get org name and slug for email
    const org = await Organization.findById(req.organizationId);

    const result = await teamService.inviteMember({
      organizationId: req.organizationId,
      email,
      role,
      password: role === "admin" ? password : undefined,
      inviterName: req.user.name,
      orgName: org.name,
      orgSlug: req.params.orgSlug,
    });

    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "team.member_invited", targetType: "organizationMember", targetId: result.member.id || result.member._id, metadata: { email, role } });

    return res.status(201).json({ member: result.member, message: result.message });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

/**
 * POST /api/o/:orgSlug/team/accept-invite
 * Accept invitation — called by staff via magic link. Body: { token, name?, password }
 */
const acceptInvitation = async (req, res) => {
  try {
    const { token, name, password } = req.body;
    const result = await teamService.acceptInvitation({
      invitationToken: token,
      name,
      password,
    });
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

/**
 * PUT /api/o/:orgSlug/team/:memberId/role
 * Change a member's role. Resets permissions to defaults.
 */
const updateMemberRole = async (req, res) => {
  try {
    const { role } = req.body;
    const member = await teamService.updateMemberRole({
      organizationId: req.organizationId,
      memberId: req.params.memberId,
      newRole: role,
    });
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "team.role_updated", targetType: "organizationMember", targetId: member.id || member._id, metadata: { role } });
    return res.json({ member });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

/**
 * PUT /api/o/:orgSlug/team/:memberId/permissions
 * Update a member's custom permissions (owner only).
 */
const updateMemberPermissions = async (req, res) => {
  try {
    const { permissions } = req.body;
    const member = await teamService.updateMemberPermissions({
      organizationId: req.organizationId,
      memberId: req.params.memberId,
      permissions,
    });
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "team.permissions_updated", targetType: "organizationMember", targetId: member.id || member._id, metadata: { permissionCount: permissions?.length || 0 } });
    return res.json({ member });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

/**
 * DELETE /api/o/:orgSlug/team/:memberId
 * Remove a member.
 */
const removeMember = async (req, res) => {
  try {
    await teamService.removeMember({
      organizationId: req.organizationId,
      memberId: req.params.memberId,
    });
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "team.member_removed", targetType: "organizationMember", targetId: req.params.memberId });
    return res.status(204).send();
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

/**
 * PUT /api/o/:orgSlug/team/:memberId/venues
 * Assign venues to a staff member. Body: { venueIds: [] }
 */
const assignVenues = async (req, res) => {
  try {
    const { venueIds } = req.body;
    const member = await teamService.assignVenues({
      organizationId: req.organizationId,
      memberId: req.params.memberId,
      venueIds: venueIds || [],
    });
    await recordPlatformAudit({ actorUserId: req.user._id, organizationId: req.organizationId, action: "team.venues_assigned", targetType: "organizationMember", targetId: member.id || member._id, metadata: { venueCount: venueIds?.length || 0 } });
    return res.json({ member });
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const getInvitationDetails = async (req, res) => {
  try {
    const { token } = req.query;
    const result = await teamService.getInvitationDetails(token);
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({ message: error.message });
  }
};

module.exports = {
  getMembers,
  inviteMember,
  acceptInvitation,
  updateMemberRole,
  updateMemberPermissions,
  removeMember,
  assignVenues,
  getInvitationDetails,
};
