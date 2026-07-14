/**
 * These endpoints exist only to DEMONSTRATE the middleware pipeline
 * working correctly. Real event/venue/booking controllers (Week 2)
 * will follow the exact same pattern: read req.organizationId (and
 * req.membership.role where relevant), scope every query by it.
 */

// Public — no login needed. This is the shape a ticket-buyer request
// will take: GET /o/:orgSlug/events uses the exact same resolveTenant
// middleware, no authenticate step at all.
const getPublicInfo = (req, res) => {
  res.json({
    organization: {
      id: req.organization._id,
      name: req.organization.name,
      slug: req.organization.slug,
    },
  });
};

// Protected — full pipeline: authenticate -> resolveTenant ->
// loadMembership. Proves that on one request we know: who is logged
// in, which tenant it's for, AND what role they hold in that tenant.
const whoAmI = (req, res) => {
  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
    },
    organization: {
      id: req.organization._id,
      name: req.organization.name,
      slug: req.organization.slug,
    },
    membership: {
      role: req.membership.role,
    },
  });
};

// Role-restricted demo — only owner/admin can reach this.
// A "staff" member (or a non-member entirely) gets blocked by
// checkRole before this handler ever runs.
const settingsPreview = (req, res) => {
  res.json({
    message: `Welcome ${req.membership.role} — you can view/edit org settings.`,
    organization: req.organization.name,
  });
};

module.exports = { getPublicInfo, whoAmI, settingsPreview };
