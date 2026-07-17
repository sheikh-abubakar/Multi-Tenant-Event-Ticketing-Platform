/**
 * Permission-based authorization system.
 *
 * Each permission follows the format: `resource:action`
 * Resources: venues, events, team, settings, org
 * Actions: create, read, update, delete, invite, remove, role, manage
 *
 * The `*` wildcard matches any action on a resource (e.g. `venues:*`)
 * or any resource at all (`*`).
 */

// ── Permission definitions ────────────────────────────────────────

const ALL_PERMISSIONS = [
  "venues:create",
  "venues:read",
  "venues:update",
  "venues:delete",

  "events:create",
  "events:read",
  "events:update",
  "events:delete",

  "team:read",
  "team:invite",
  "team:remove",
  "team:role",

  "settings:read",
  "settings:update",

  "org:delete",

  "permissions:manage",
];

// ── Default roles → permissions mapping ───────────────────────────
// Owner has ALL permissions via the "*" wildcard
// Admin and Staff have sensible defaults that an Owner can customize

const DEFAULT_ROLE_PERMISSIONS = {
  owner: ["*"], // wildcard = everything

  admin: [
    "venues:create",
    "venues:read",
    "venues:update",
    "venues:delete",

    "events:create",
    "events:read",
    "events:update",
    "events:delete",

    "team:read",
    "team:invite",
    "team:remove",
    "team:role",

    "settings:read",
    "settings:update",
  ],

  staff: [
    "venues:create",
    "venues:read",
    "venues:update",

    "events:create",
    "events:read",
    "events:update",

    "team:read",
  ],
};

// ── Helper functions ──────────────────────────────────────────────

/**
 * Check if a permission string matches a required permission.
 * Supports wildcards: "venues:*" matches "venues:create", "venues:delete", etc.
 * "*" matches everything.
 *
 * @param {string} required - The permission required (e.g. "venues:delete")
 * @param {string[]} granted - The permissions the user has (may include wildcards)
 * @returns {boolean}
 */
const hasPermission = (required, granted) => {
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

/**
 * Get the default permissions for a given role.
 */
const getDefaultPermissions = (role) => {
  return DEFAULT_ROLE_PERMISSIONS[role] || [];
};

/**
 * All available permissions (for UI display).
 */
const getPermissionCatalog = () => {
  return [
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
  ];
};

module.exports = {
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  hasPermission,
  getDefaultPermissions,
  getPermissionCatalog,
};