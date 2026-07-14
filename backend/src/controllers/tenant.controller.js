/**
 * These two endpoints exist only to DEMONSTRATE tenant resolution
 * working correctly. Real event/venue/booking controllers (Week 2)
 * will follow the same pattern: read req.organizationId, scope
 * every query by it.
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

// Protected — requires login AND a resolved tenant. Simulates the
// organizer-side request shape. Membership/role checking is NOT
// done here yet (that's Week 1 Day 4-5) — this only proves that,
// on the same request, we know both "who is logged in" (req.user)
// and "which tenant this request is for" (req.organization).
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
  });
};

module.exports = { getPublicInfo, whoAmI };
