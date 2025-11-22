/**
 * RBAC Permissions Matrix
 *
 * Defines role-based access control permissions for organization members.
 * Each permission maps to specific actions within the CMS.
 *
 * Roles (in order of privilege):
 * - owner: Full control including billing and organization management
 * - admin: Organization management except billing
 * - editor: Content creation and editing
 * - publisher: Content publishing only
 * - viewer: Read-only access
 *
 * Ticket: SF-007
 */

/**
 * Available permissions in the system
 */
export enum Permission {
  // Billing & Organization Management
  MANAGE_BILLING = 'manage_billing',
  MANAGE_ORGANIZATION = 'manage_organization',

  // Member Management
  INVITE_USERS = 'invite_users',
  MANAGE_MEMBERS = 'manage_members',

  // Site Management
  CREATE_SITES = 'create_sites',
  MANAGE_SITES = 'manage_sites',

  // Content Management
  CREATE_POSTS = 'create_posts',
  EDIT_POSTS = 'edit_posts',
  PUBLISH_POSTS = 'publish_posts',
  DELETE_POSTS = 'delete_posts',

  // Analytics & Data
  VIEW_ANALYTICS = 'view_analytics',
  EXPORT_DATA = 'export_data',

  // Read Access
  VIEW_POSTS = 'view_posts',
  VIEW_SETTINGS = 'view_settings',
}

/**
 * Organization roles
 */
export enum OrganizationRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  PUBLISHER = 'publisher',
  VIEWER = 'viewer',
}

/**
 * Permissions matrix mapping roles to their allowed permissions
 *
 * Format: Permission => Set of roles that have this permission
 */
export const PERMISSIONS_MATRIX: Record<Permission, Set<OrganizationRole>> = {
  // Billing & Organization (Owner only)
  [Permission.MANAGE_BILLING]: new Set([OrganizationRole.OWNER]),
  [Permission.MANAGE_ORGANIZATION]: new Set([OrganizationRole.OWNER]),

  // Member Management (Owner, Admin)
  [Permission.INVITE_USERS]: new Set([OrganizationRole.OWNER, OrganizationRole.ADMIN]),
  [Permission.MANAGE_MEMBERS]: new Set([OrganizationRole.OWNER, OrganizationRole.ADMIN]),

  // Site Management (Owner, Admin)
  [Permission.CREATE_SITES]: new Set([OrganizationRole.OWNER, OrganizationRole.ADMIN]),
  [Permission.MANAGE_SITES]: new Set([OrganizationRole.OWNER, OrganizationRole.ADMIN]),

  // Content Creation (Owner, Admin, Editor)
  [Permission.CREATE_POSTS]: new Set([
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.EDITOR,
  ]),
  [Permission.EDIT_POSTS]: new Set([
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.EDITOR,
  ]),

  // Content Publishing (Owner, Admin, Editor, Publisher)
  [Permission.PUBLISH_POSTS]: new Set([
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.EDITOR,
    OrganizationRole.PUBLISHER,
  ]),

  // Content Deletion (Owner, Admin)
  [Permission.DELETE_POSTS]: new Set([OrganizationRole.OWNER, OrganizationRole.ADMIN]),

  // Analytics & Export (Owner, Admin, Editor)
  [Permission.VIEW_ANALYTICS]: new Set([
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.EDITOR,
  ]),
  [Permission.EXPORT_DATA]: new Set([OrganizationRole.OWNER, OrganizationRole.ADMIN]),

  // Read Access (All roles)
  [Permission.VIEW_POSTS]: new Set([
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.EDITOR,
    OrganizationRole.PUBLISHER,
    OrganizationRole.VIEWER,
  ]),
  [Permission.VIEW_SETTINGS]: new Set([
    OrganizationRole.OWNER,
    OrganizationRole.ADMIN,
    OrganizationRole.EDITOR,
    OrganizationRole.PUBLISHER,
    OrganizationRole.VIEWER,
  ]),
};

/**
 * Check if a role has a specific permission
 *
 * @param role - Organization role to check
 * @param permission - Permission to verify
 * @returns true if role has permission, false otherwise
 */
export function hasPermission(role: OrganizationRole, permission: Permission): boolean {
  const allowedRoles = PERMISSIONS_MATRIX[permission];
  return allowedRoles ? allowedRoles.has(role) : false;
}

/**
 * Get all permissions for a given role
 *
 * @param role - Organization role
 * @returns Array of permissions the role has
 */
export function getRolePermissions(role: OrganizationRole): Permission[] {
  const permissions: Permission[] = [];

  for (const [permission, roles] of Object.entries(PERMISSIONS_MATRIX)) {
    if (roles.has(role)) {
      permissions.push(permission as Permission);
    }
  }

  return permissions;
}

/**
 * Permission matrix as a readable table (for documentation/debugging)
 */
export function getPermissionsTable(): Record<string, Record<OrganizationRole, boolean>> {
  const table: Record<string, Record<OrganizationRole, boolean>> = {};

  Object.values(Permission).forEach((permission) => {
    table[permission] = {
      [OrganizationRole.OWNER]: hasPermission(OrganizationRole.OWNER, permission),
      [OrganizationRole.ADMIN]: hasPermission(OrganizationRole.ADMIN, permission),
      [OrganizationRole.EDITOR]: hasPermission(OrganizationRole.EDITOR, permission),
      [OrganizationRole.PUBLISHER]: hasPermission(OrganizationRole.PUBLISHER, permission),
      [OrganizationRole.VIEWER]: hasPermission(OrganizationRole.VIEWER, permission),
    };
  });

  return table;
}
