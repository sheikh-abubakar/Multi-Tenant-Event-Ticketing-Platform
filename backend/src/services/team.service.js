const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const OrganizationMember = require("../models/OrganizationMember");
const User = require("../models/User");
const Organization = require("../models/Organization");
const { getDefaultPermissions } = require("../utils/permissions");
const { generateInvitationToken, createInvitationUrl } = require("../utils/invitationToken");
const { sendTeamInvitation } = require("../config/email");

/**
 * Get all members of an organization with their user details, roles, and permissions.
 */
const getMembers = async (organizationId) => {
  const members = await OrganizationMember.find({ organizationId })
    .populate("userId", "name email")
    .populate("assignedVenues", "name city")
    .sort({ role: 1, createdAt: -1 });

  return members
    .filter((m) => m.userId)
    .map((m) => ({
      id: m._id,
      user: {
        id: m.userId._id,
        name: m.userId.name,
        email: m.userId.email,
      },
      role: m.role,
      permissions: m.permissions || [],
      assignedVenues: m.assignedVenues || [],
      passwordSet: m.passwordSet,
      joinedAt: m.createdAt,
    }));
};

/**
 * Invite a member to an organization.
 *
 * FLOW:
 *   Admin invite → Owner sets password and chooses role upfront.
 *                  Admin can login immediately.
 *
 *   Staff invite → Owner provides email + role.
 *                  System creates a pending membership with invitationToken.
 *                  Email sent to staff with magic link to accept + set password.
 */
const inviteMember = async ({ organizationId, email, role, password, inviterName, orgName, orgSlug }) => {
  if (!email || !email.trim()) {
    const error = new Error("Email is required");
    error.statusCode = 400;
    throw error;
  }

  const allowedRoles = ["admin", "staff"];
  if (!allowedRoles.includes(role)) {
    const error = new Error(`Role must be one of: ${allowedRoles.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();
  let user = await User.findOne({ email: normalizedEmail });

  if (user) {
    // Check if already a member
    const alreadyMember = await OrganizationMember.findOne({
      userId: user._id,
      organizationId,
    });
    if (alreadyMember) {
      const error = new Error(`${normalizedEmail} is already a member of this organization`);
      error.statusCode = 409;
      throw error;
    }
  }

  // ── Admin invite for NEW users: create user with password immediately ──
  const isNewAdmin = role === "admin" && !user;
  if (isNewAdmin) {
    if (!password || password.length < 6) {
      const error = new Error("Password is required (minimum 6 characters) for admin invites");
      error.statusCode = 400;
      throw error;
    }

    const session = await mongoose.startSession();
    try {
      let memberDoc;
      await session.withTransaction(async () => {
        const nameFromEmail = normalizedEmail.split("@")[0];
        const passwordHash = await bcrypt.hash(password, 10);
        const users = await User.create(
          [{
            name: nameFromEmail,
            email: normalizedEmail,
            passwordHash,
          }],
          { session }
        );
        user = users[0];

        const defaultPermissions = getDefaultPermissions("admin");
        const memberDocs = await OrganizationMember.create(
          [{
            userId: user._id,
            organizationId,
            role: "admin",
            permissions: defaultPermissions,
            passwordSet: true,
          }],
          { session }
        );
        memberDoc = memberDocs[0];
      });

      // Re-fetch with populated user data
      const populated = await OrganizationMember.findById(memberDoc._id)
        .populate("userId", "name email");

      return {
        member: {
          id: populated._id,
          user: {
            id: populated.userId._id,
            name: populated.userId.name,
            email: populated.userId.email,
          },
          role: populated.role,
          permissions: populated.permissions,
          passwordSet: true,
          joinedAt: populated.createdAt,
        },
        message: `${normalizedEmail} has been added as admin. They can login now.`,
      };
    } finally {
      session.endSession();
    }
  }

  // ── Existing user (Admin/Staff) OR Staff invite: send invitation link ──
  const invitationToken = generateInvitationToken();
  const session = await mongoose.startSession();
  let memberDoc;

  try {
    await session.withTransaction(async () => {
      if (!user) {
        const nameFromEmail = normalizedEmail.split("@")[0];
        const users = await User.create(
          [{
            name: nameFromEmail,
            email: normalizedEmail,
            passwordHash: "$2b$10$placeholder", // cannot login until they accept
          }],
          { session }
        );
        user = users[0];
      }

      const defaultPermissions = getDefaultPermissions(role);
      const memberDocs = await OrganizationMember.create(
        [{
          userId: user._id,
          organizationId,
          role,
          permissions: defaultPermissions,
          invitationToken,
          invitationSentAt: new Date(),
          passwordSet: user.passwordHash && user.passwordHash !== "$2b$10$placeholder" ? true : false,
        }],
        { session }
      );
      memberDoc = memberDocs[0];
    });

    // Send invitation email
    try {
      await sendTeamInvitation({
        email: normalizedEmail,
        orgName,
        orgSlug,
        inviterName,
        invitationToken,
      });
    } catch (emailErr) {
      console.warn(`[Team] Invitation email failed for ${normalizedEmail}:`, emailErr.message);
    }

    const populated = await OrganizationMember.findById(memberDoc._id)
      .populate("userId", "name email");

    return {
      member: {
        id: populated._id,
        user: {
          id: populated.userId._id,
          name: populated.userId.name,
          email: populated.userId.email,
        },
        role: populated.role,
        permissions: populated.permissions,
        passwordSet: populated.passwordSet,
        joinedAt: populated.createdAt,
      },
      message: `Invitation sent to ${normalizedEmail}. They'll receive an email to join the team.`,
    };
  } finally {
    session.endSession();
  }
};

/**
 * Accept invitation — called when staff clicks the magic link.
 * Validates the token and sets their password.
 */
const acceptInvitation = async ({ invitationToken, name, password }) => {
  const membership = await OrganizationMember.findOne({ invitationToken })
    .populate("userId");

  if (!membership) {
    const error = new Error("Invalid or expired invitation link");
    error.statusCode = 404;
    throw error;
  }

  if (membership.passwordSet && !membership.invitationToken) {
    const error = new Error("This invitation has already been accepted");
    error.statusCode = 410;
    throw error;
  }

  const userHasPassword = membership.userId.passwordHash && membership.userId.passwordHash !== "$2b$10$placeholder";
  
  if (!userHasPassword && (!password || password.length < 6)) {
    const error = new Error("Password is required (minimum 6 characters)");
    error.statusCode = 400;
    throw error;
  }

  // Check if token is expired (7 days)
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (membership.invitationSentAt && (Date.now() - membership.invitationSentAt.getTime()) > sevenDays) {
    const error = new Error("This invitation link has expired. Please ask the organization owner to send a new invitation");
    error.statusCode = 410;
    throw error;
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const updateData = {};
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }
      if (name && name.trim()) {
        updateData.name = name.trim();
      }
      
      if (Object.keys(updateData).length > 0) {
        await User.findByIdAndUpdate(membership.userId._id, updateData, { session });
      }

      // Clear invitation token and mark password as set
      membership.invitationToken = null;
      membership.passwordSet = true;
      await membership.save({ session });
    });

    return {
      message: "Invitation accepted successfully!",
      email: membership.userId.email,
      orgId: membership.organizationId,
    };
  } finally {
    session.endSession();
  }
};

/**
 * Change a member's role. Resets permissions to defaults for the new role.
 * Owners cannot be demoted.
 */
const updateMemberRole = async ({ organizationId, memberId, newRole }) => {
  const allowedRoles = ["admin", "staff"];
  if (!allowedRoles.includes(newRole)) {
    const error = new Error(`Role must be one of: ${allowedRoles.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  const member = await OrganizationMember.findOne({
    _id: memberId,
    organizationId,
  });

  if (!member) {
    const error = new Error("Member not found");
    error.statusCode = 404;
    throw error;
  }

  if (member.role === "owner") {
    const error = new Error("Cannot change the role of the organization owner");
    error.statusCode = 403;
    throw error;
  }

  // Reset permissions to defaults for the new role
  member.role = newRole;
  member.permissions = getDefaultPermissions(newRole);
  await member.save();

  const populated = await OrganizationMember.findById(member._id)
    .populate("userId", "name email");

  return {
    id: populated._id,
    user: {
      id: populated.userId._id,
      name: populated.userId.name,
      email: populated.userId.email,
    },
    role: populated.role,
    permissions: populated.permissions,
    joinedAt: populated.createdAt,
  };
};

/**
 * Update a member's permissions (owner only).
 */
const updateMemberPermissions = async ({ organizationId, memberId, permissions }) => {
  const member = await OrganizationMember.findOne({
    _id: memberId,
    organizationId,
  });

  if (!member) {
    const error = new Error("Member not found");
    error.statusCode = 404;
    throw error;
  }

  if (member.role === "owner") {
    const error = new Error("Cannot modify owner permissions");
    error.statusCode = 403;
    throw error;
  }

  member.permissions = permissions;
  await member.save();

  const populated = await OrganizationMember.findById(member._id)
    .populate("userId", "name email");

  return {
    id: populated._id,
    user: {
      id: populated.userId._id,
      name: populated.userId.name,
      email: populated.userId.email,
    },
    role: populated.role,
    permissions: populated.permissions,
    joinedAt: populated.createdAt,
  };
};

/**
 * Remove a member from the organization. Owners cannot be removed.
 */
const removeMember = async ({ organizationId, memberId }) => {
  const member = await OrganizationMember.findOne({
    _id: memberId,
    organizationId,
  });

  if (!member) {
    const error = new Error("Member not found");
    error.statusCode = 404;
    throw error;
  }

  if (member.role === "owner") {
    const error = new Error("Cannot remove the organization owner");
    error.statusCode = 403;
    throw error;
  }

  await OrganizationMember.deleteOne({ _id: memberId, organizationId });

  return { removed: true };
};

/**
 * Assign venues to a member (staff only).
 * Owner/Admin can set which venues a staff member has access to.
 */
const assignVenues = async ({ organizationId, memberId, venueIds }) => {
  const member = await OrganizationMember.findOne({
    _id: memberId,
    organizationId,
  });

  if (!member) {
    const error = new Error("Member not found");
    error.statusCode = 404;
    throw error;
  }

  if (member.role === "owner") {
    const error = new Error("Cannot assign venues to the organization owner");
    error.statusCode = 403;
    throw error;
  }

  // Validate all venueIds belong to this org
  const Venue = require("../models/Venue");
  const venues = await Venue.find({
    _id: { $in: venueIds },
    organizationId,
  });

  if (venues.length !== venueIds.length) {
    const error = new Error("One or more venues do not belong to this organization");
    error.statusCode = 400;
    throw error;
  }

  member.assignedVenues = venueIds;
  await member.save();

  const populated = await OrganizationMember.findById(member._id)
    .populate("userId", "name email")
    .populate("assignedVenues", "name city");

  return {
    id: populated._id,
    user: {
      id: populated.userId._id,
      name: populated.userId.name,
      email: populated.userId.email,
    },
    role: populated.role,
    permissions: populated.permissions,
    assignedVenues: populated.assignedVenues,
    joinedAt: populated.createdAt,
  };
};

const getInvitationDetails = async (invitationToken) => {
  const membership = await OrganizationMember.findOne({ invitationToken })
    .populate("userId", "name email passwordHash");

  if (!membership) {
    const error = new Error("Invalid or expired invitation link");
    error.statusCode = 404;
    throw error;
  }

  const userHasPassword = membership.userId.passwordHash && membership.userId.passwordHash !== "$2b$10$placeholder";

  return {
    email: membership.userId.email,
    name: membership.userId.name,
    role: membership.role,
    hasPassword: !!userHasPassword,
  };
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
