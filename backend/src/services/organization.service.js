const mongoose = require("mongoose");
const Organization = require("../models/Organization");
const OrganizationMember = require("../models/OrganizationMember");
const { slugify, generateUniqueSlug } = require("../utils/slugify");
/**
 * Creates an Organization AND makes the creating user its "owner"
 * in the SAME atomic operation (using a transaction).
 *
 * Why a transaction: these are two separate documents (Organization +
 * OrganizationMember) that must both succeed or both fail together.
 * If Organization got created but the OrganizationMember write failed,
 * we'd end up with an org that has no owner — an orphaned tenant.
 * A transaction guarantees that never happens.
 */
const createOrganization = async ({ name, slug: requestedSlug }, userId) => {
  if (!name) {
    const error = new Error("Organization name is required");
    error.statusCode = 400;
    throw error;
  }

  // If the user supplied their own slug, validate + check it's free.
  // Otherwise auto-generate one from the name.
  let slug;
  if (requestedSlug) {
    slug = slugify(requestedSlug);
    const existing = await Organization.findOne({ slug });
    if (existing) {
      const error = new Error(`Slug "${slug}" is already taken`);
      error.statusCode = 409;
      throw error;
    }
  } else {
    slug = await generateUniqueSlug(name);
  }

  const session = await mongoose.startSession();
  try {
    let organization;

    await session.withTransaction(async () => {
      const orgDocs = await Organization.create([{ name, slug }], { session });
      organization = orgDocs[0];

      await OrganizationMember.create(
        [
          {
            userId,
            organizationId: organization._id,
            role: "owner",
          },
        ],
        { session }
      );
    });

    return organization;
  } finally {
    session.endSession();
  }
};

/**
 * Lists every organization the given user is a member of, along with
 * their role in each one. This is what powers the "pick your
 * organization" screen on the frontend — a user might belong to
 * several orgs with different roles in each.
 */
const listMyOrganizations = async (userId) => {
  const memberships = await OrganizationMember.find({ userId }).populate("organizationId");

  return memberships
    .filter((m) => m.organizationId && !m.organizationId.isDeleted) // skip dangling refs + soft-deleted orgs
    .map((m) => ({
      role: m.role,
      organization: {
        id: m.organizationId._id,
        name: m.organizationId.name,
        slug: m.organizationId.slug,
        logoUrl: m.organizationId.logoUrl,
      },
    }));
};

/**
 * Returns the full org record for the settings page.
 */
const getOrganizationSettings = async (organizationId) => {
  return Organization.findById(organizationId);
};

/**
 * Updates name/slug/logoUrl. If slug is being changed, re-validates
 * uniqueness (excluding this org's own current document) — same rule
 * as at creation time, since the slug is what the public storefront
 * URL is built from.
 */
const updateOrganizationSettings = async (organizationId, updates, logoUrl) => {
  const safeUpdates = {};

  if (updates.name !== undefined) {
    if (!updates.name.trim()) {
      const error = new Error("Organization name cannot be empty");
      error.statusCode = 400;
      throw error;
    }
    safeUpdates.name = updates.name.trim();
  }

  if (updates.slug !== undefined && updates.slug.trim()) {
    const newSlug = slugify(updates.slug);
    const clash = await Organization.findOne({
      slug: newSlug,
      _id: { $ne: organizationId },
    });
    if (clash) {
      const error = new Error(`Slug "${newSlug}" is already taken`);
      error.statusCode = 409;
      throw error;
    }
    safeUpdates.slug = newSlug;
  }

  if (logoUrl) {
    safeUpdates.logoUrl = logoUrl;
  }

  const organization = await Organization.findByIdAndUpdate(organizationId, safeUpdates, {
    new: true,
    runValidators: true,
  });

  if (!organization) {
    const error = new Error("Organization not found");
    error.statusCode = 404;
    throw error;
  }

  return organization;
};

/**
 * Soft delete — team lead decision (Week 1): never actually remove the
 * MongoDB document. Just flip isDeleted + record deletedAt. From this
 * point on, resolveTenant (middleware) will 404 on this org's slug for
 * every route in the app, but the document — and everything still
 * linked to it via organizationId (events, bookings, venues...) —
 * stays in the database untouched.
 */
const softDeleteOrganization = async (organizationId) => {
  const organization = await Organization.findByIdAndUpdate(
    organizationId,
    { isDeleted: true, deletedAt: new Date() },
    { new: true },
  );

  if (!organization) {
    const error = new Error("Organization not found");
    error.statusCode = 404;
    throw error;
  }

  return organization;
};

module.exports = {
  createOrganization,
  listMyOrganizations,
  getOrganizationSettings,
  updateOrganizationSettings,
  softDeleteOrganization,
};