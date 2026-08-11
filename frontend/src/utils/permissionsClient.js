/**
 * Frontend mirror of backend/src/utils/permissions.js
 *
 * This provides the same permission catalog for the permissions UI
 * without needing a backend API call just to render checkboxes.
 */
const PERMISSION_CATALOG = [
  {
    resource: "venues",
    label: "Venues",
    actions: [
      { action: "create", label: "Create venues" },
      { action: "read", label: "View venues" },
      { action: "update", label: "Edit venues" },
      { action: "delete", label: "Delete venues" },
    ],
  },
  {
    resource: "events",
    label: "Events",
    actions: [
      { action: "create", label: "Create events" },
      { action: "read", label: "View events" },
      { action: "update", label: "Edit events" },
      { action: "delete", label: "Delete events" },
    ],
  },
  {
    resource: "team",
    label: "Team",
    actions: [
      { action: "read", label: "View team members" },
      { action: "invite", label: "Invite new members" },
      { action: "remove", label: "Remove members" },
      { action: "role", label: "Change member roles" },
    ],
  },
  {
    resource: "settings",
    label: "Settings",
    actions: [
      { action: "read", label: "View settings" },
      { action: "update", label: "Update settings" },
    ],
  },
  {
    resource: "org",
    label: "Organization",
    actions: [
      { action: "delete", label: "Delete organization" },
    ],
  },
  {
    resource: "bundles",
    label: "Event Bundles",
    actions: [
      { action: "create", label: "Create bundles" },
      { action: "read", label: "View bundles" },
      { action: "update", label: "Edit bundles" },
      { action: "delete", label: "Delete bundles" },
    ],
  },
  {
    resource: "seatchange",
    label: "Seat Change Requests",
    actions: [
      { action: "update", label: "Manage seat changes" },
    ],
  },
  {
    resource: "media",
    label: "Media Gallery",
    actions: [
      { action: "create", label: "Upload media" },
      { action: "read", label: "View media list" },
      { action: "delete", label: "Delete media items" },
    ],
  },
  {
    resource: "coupons",
    label: "Discount Coupons",
    actions: [
      { action: "create", label: "Create coupons" },
      { action: "read", label: "View coupons" },
      { action: "delete", label: "Delete coupons" },
    ],
  },
];

export const getPermissionCatalog = () => PERMISSION_CATALOG;

/**
 * Check if a user's permissions include a specific permission.
 * Supports wildcards.
 */
export const hasPermission = (required, granted) => {
  if (!granted || !Array.isArray(granted)) return false;
  for (const grantedPerm of granted) {
    if (grantedPerm === "*") return true;
    const [grantedResource, grantedAction] = grantedPerm.split(":");
    const [requiredResource, requiredAction] = required.split(":");
    if (grantedResource === "*") return true;
    if (grantedResource === requiredResource && grantedAction === "*") return true;
    if (grantedResource === requiredResource && grantedAction === requiredAction) return true;
  }
  return false;
};