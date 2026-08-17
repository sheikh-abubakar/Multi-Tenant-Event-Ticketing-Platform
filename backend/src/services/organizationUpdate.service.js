const { invalidateOrgCache } = require("./analytics.service");
const { emitOrganizationBookingUpdate } = require("./realtime.service");

const notifyOrganizationBookingUpdate = (organizationId, payload = {}) => {
  if (!organizationId) return;
  const id = organizationId.toString();
  invalidateOrgCache(id);
  emitOrganizationBookingUpdate(id, payload);
};

module.exports = { notifyOrganizationBookingUpdate };
