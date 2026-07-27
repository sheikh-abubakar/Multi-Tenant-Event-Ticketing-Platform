const Organization = require("../models/Organization");

/**
 * Tenant-resolution middleware.
 *
 * Runs at the request edge for any route shaped like /o/:orgSlug/...
 * It reads the slug from the URL, looks up the matching Organization,
 * and attaches it to the request BEFORE any controller logic runs.
 *
 * From this point on, every downstream handler can trust
 * `req.organizationId` to scope its database queries — this is the
 * field that will go into every `.find({ organizationId: ... })`
 * call across the whole app.
 *
 * Note: this middleware does NOT check if the current user is a
 * member of this org, or what their role is — that's a separate
 * step (membership + role-check middleware, Week 1 Day 4-5) that
 * runs AFTER this one, only on routes that actually need it.
 * Public storefront routes (ticket buyers browsing events) will use
 * ONLY this middleware, with no membership check at all.
 *
 * SOFT DELETE ENFORCEMENT: this is the single place in the whole app
 * that decides whether a "deleted" organization is visible. Deleting
 * an org (see organization.service.js softDeleteOrganization) never
 * removes its MongoDB document — it just sets isDeleted: true. By
 * excluding isDeleted orgs right here, every single tenant-scoped
 * route in the app (venues, events, bookings, settings, everything)
 * automatically treats a deleted org as 404 Not Found, with zero
 * changes needed in any other file.
 */
const resolveTenant = async (req, res, next) => {
  try {
    const { orgSlug } = req.params;

    if (!orgSlug) {
      return res.status(400).json({ message: "Organization slug is missing from the URL" });
    }

    const organization = await Organization.findOne({ slug: orgSlug, isDeleted: { $ne: true }, isSuspended: { $ne: true } });

    if (!organization) {
      return res.status(404).json({ message: `No organization found for slug "${orgSlug}"` });
    }

    req.organization = organization;
    req.organizationId = organization._id;
    next();
  } catch (error) {
    return res.status(500).json({ message: "Failed to resolve organization" });
  }
};

module.exports = resolveTenant;
