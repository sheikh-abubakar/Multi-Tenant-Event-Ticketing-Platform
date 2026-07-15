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
    .filter((m) => m.organizationId) // guard against a dangling reference
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

module.exports = { createOrganization, listMyOrganizations };
