import {
  Permission,
  OrganizationRole,
  PERMISSIONS_MATRIX,
  hasPermission,
  getRolePermissions,
  getPermissionsTable,
} from '../../config/permissions';

describe('Permissions Configuration', () => {
  describe('PERMISSIONS_MATRIX', () => {
    it('should have all 14 permissions defined', () => {
      const permissions = Object.values(Permission);
      expect(permissions).toHaveLength(14);

      // Verify all permissions are in the matrix
      permissions.forEach((permission) => {
        expect(PERMISSIONS_MATRIX[permission]).toBeDefined();
        expect(PERMISSIONS_MATRIX[permission]).toBeInstanceOf(Set);
      });
    });

    it('should grant OWNER role all permissions', () => {
      const permissions = Object.values(Permission);

      permissions.forEach((permission) => {
        const hasAccess = hasPermission(OrganizationRole.OWNER, permission);
        expect(hasAccess).toBe(true);
      });
    });

    it('should grant VIEWER role only read permissions', () => {
      expect(hasPermission(OrganizationRole.VIEWER, Permission.VIEW_POSTS)).toBe(true);
      expect(hasPermission(OrganizationRole.VIEWER, Permission.VIEW_SETTINGS)).toBe(true);

      // Viewers should NOT have write permissions
      expect(hasPermission(OrganizationRole.VIEWER, Permission.CREATE_POSTS)).toBe(false);
      expect(hasPermission(OrganizationRole.VIEWER, Permission.EDIT_POSTS)).toBe(false);
      expect(hasPermission(OrganizationRole.VIEWER, Permission.PUBLISH_POSTS)).toBe(false);
      expect(hasPermission(OrganizationRole.VIEWER, Permission.DELETE_POSTS)).toBe(false);
      expect(hasPermission(OrganizationRole.VIEWER, Permission.MANAGE_SITES)).toBe(false);
    });
  });

  describe('hasPermission', () => {
    describe('Billing & Organization Management', () => {
      it('should grant MANAGE_BILLING only to OWNER', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.MANAGE_BILLING)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.MANAGE_BILLING)).toBe(false);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.MANAGE_BILLING)).toBe(false);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.MANAGE_BILLING)).toBe(false);
        expect(hasPermission(OrganizationRole.VIEWER, Permission.MANAGE_BILLING)).toBe(false);
      });

      it('should grant MANAGE_ORGANIZATION only to OWNER', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.MANAGE_ORGANIZATION)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.MANAGE_ORGANIZATION)).toBe(false);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.MANAGE_ORGANIZATION)).toBe(false);
      });
    });

    describe('Member Management', () => {
      it('should grant INVITE_USERS to OWNER and ADMIN', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.INVITE_USERS)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.INVITE_USERS)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.INVITE_USERS)).toBe(false);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.INVITE_USERS)).toBe(false);
        expect(hasPermission(OrganizationRole.VIEWER, Permission.INVITE_USERS)).toBe(false);
      });

      it('should grant MANAGE_MEMBERS to OWNER and ADMIN', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.MANAGE_MEMBERS)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.MANAGE_MEMBERS)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.MANAGE_MEMBERS)).toBe(false);
      });
    });

    describe('Site Management', () => {
      it('should grant CREATE_SITES to OWNER and ADMIN', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.CREATE_SITES)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.CREATE_SITES)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.CREATE_SITES)).toBe(false);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.CREATE_SITES)).toBe(false);
      });

      it('should grant MANAGE_SITES to OWNER and ADMIN', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.MANAGE_SITES)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.MANAGE_SITES)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.MANAGE_SITES)).toBe(false);
      });
    });

    describe('Content Management', () => {
      it('should grant CREATE_POSTS to OWNER, ADMIN, and EDITOR', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.CREATE_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.CREATE_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.CREATE_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.CREATE_POSTS)).toBe(false);
        expect(hasPermission(OrganizationRole.VIEWER, Permission.CREATE_POSTS)).toBe(false);
      });

      it('should grant EDIT_POSTS to OWNER, ADMIN, and EDITOR', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.EDIT_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.EDIT_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.EDIT_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.EDIT_POSTS)).toBe(false);
      });

      it('should grant PUBLISH_POSTS to OWNER, ADMIN, EDITOR, and PUBLISHER', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.PUBLISH_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.PUBLISH_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.PUBLISH_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.PUBLISH_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.VIEWER, Permission.PUBLISH_POSTS)).toBe(false);
      });

      it('should grant DELETE_POSTS to OWNER and ADMIN only', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.DELETE_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.DELETE_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.DELETE_POSTS)).toBe(false);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.DELETE_POSTS)).toBe(false);
      });
    });

    describe('Analytics & Data', () => {
      it('should grant VIEW_ANALYTICS to OWNER, ADMIN, and EDITOR', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.VIEW_ANALYTICS)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.VIEW_ANALYTICS)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.VIEW_ANALYTICS)).toBe(true);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.VIEW_ANALYTICS)).toBe(false);
        expect(hasPermission(OrganizationRole.VIEWER, Permission.VIEW_ANALYTICS)).toBe(false);
      });

      it('should grant EXPORT_DATA to OWNER and ADMIN', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.EXPORT_DATA)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.EXPORT_DATA)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.EXPORT_DATA)).toBe(false);
      });
    });

    describe('Read Access', () => {
      it('should grant VIEW_POSTS to all roles', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.VIEW_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.VIEW_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.VIEW_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.VIEW_POSTS)).toBe(true);
        expect(hasPermission(OrganizationRole.VIEWER, Permission.VIEW_POSTS)).toBe(true);
      });

      it('should grant VIEW_SETTINGS to all roles', () => {
        expect(hasPermission(OrganizationRole.OWNER, Permission.VIEW_SETTINGS)).toBe(true);
        expect(hasPermission(OrganizationRole.ADMIN, Permission.VIEW_SETTINGS)).toBe(true);
        expect(hasPermission(OrganizationRole.EDITOR, Permission.VIEW_SETTINGS)).toBe(true);
        expect(hasPermission(OrganizationRole.PUBLISHER, Permission.VIEW_SETTINGS)).toBe(true);
        expect(hasPermission(OrganizationRole.VIEWER, Permission.VIEW_SETTINGS)).toBe(true);
      });
    });
  });

  describe('getRolePermissions', () => {
    it('should return all permissions for OWNER', () => {
      const permissions = getRolePermissions(OrganizationRole.OWNER);
      expect(permissions).toHaveLength(14);
      expect(permissions).toContain(Permission.MANAGE_BILLING);
      expect(permissions).toContain(Permission.MANAGE_ORGANIZATION);
    });

    it('should return correct permissions for ADMIN', () => {
      const permissions = getRolePermissions(OrganizationRole.ADMIN);

      // ADMIN should have most permissions except billing and organization management
      expect(permissions).toContain(Permission.INVITE_USERS);
      expect(permissions).toContain(Permission.MANAGE_MEMBERS);
      expect(permissions).toContain(Permission.CREATE_SITES);
      expect(permissions).toContain(Permission.MANAGE_SITES);
      expect(permissions).toContain(Permission.CREATE_POSTS);
      expect(permissions).toContain(Permission.EDIT_POSTS);
      expect(permissions).toContain(Permission.PUBLISH_POSTS);
      expect(permissions).toContain(Permission.DELETE_POSTS);
      expect(permissions).toContain(Permission.VIEW_ANALYTICS);
      expect(permissions).toContain(Permission.EXPORT_DATA);
      expect(permissions).toContain(Permission.VIEW_POSTS);
      expect(permissions).toContain(Permission.VIEW_SETTINGS);

      // Should NOT have owner-only permissions
      expect(permissions).not.toContain(Permission.MANAGE_BILLING);
      expect(permissions).not.toContain(Permission.MANAGE_ORGANIZATION);
    });

    it('should return correct permissions for EDITOR', () => {
      const permissions = getRolePermissions(OrganizationRole.EDITOR);

      // EDITOR can create, edit, publish content and view analytics
      expect(permissions).toContain(Permission.CREATE_POSTS);
      expect(permissions).toContain(Permission.EDIT_POSTS);
      expect(permissions).toContain(Permission.PUBLISH_POSTS);
      expect(permissions).toContain(Permission.VIEW_ANALYTICS);
      expect(permissions).toContain(Permission.VIEW_POSTS);
      expect(permissions).toContain(Permission.VIEW_SETTINGS);

      // Should NOT have admin permissions
      expect(permissions).not.toContain(Permission.MANAGE_MEMBERS);
      expect(permissions).not.toContain(Permission.CREATE_SITES);
      expect(permissions).not.toContain(Permission.DELETE_POSTS);
      expect(permissions).not.toContain(Permission.EXPORT_DATA);
    });

    it('should return correct permissions for PUBLISHER', () => {
      const permissions = getRolePermissions(OrganizationRole.PUBLISHER);

      // PUBLISHER can only publish and view
      expect(permissions).toContain(Permission.PUBLISH_POSTS);
      expect(permissions).toContain(Permission.VIEW_POSTS);
      expect(permissions).toContain(Permission.VIEW_SETTINGS);

      // Should NOT have create/edit permissions
      expect(permissions).not.toContain(Permission.CREATE_POSTS);
      expect(permissions).not.toContain(Permission.EDIT_POSTS);
      expect(permissions).not.toContain(Permission.DELETE_POSTS);
    });

    it('should return only read permissions for VIEWER', () => {
      const permissions = getRolePermissions(OrganizationRole.VIEWER);

      expect(permissions).toHaveLength(2);
      expect(permissions).toContain(Permission.VIEW_POSTS);
      expect(permissions).toContain(Permission.VIEW_SETTINGS);
    });
  });

  describe('getPermissionsTable', () => {
    it('should return a complete permissions table', () => {
      const table = getPermissionsTable();

      // Should have entries for all 14 permissions
      expect(Object.keys(table)).toHaveLength(14);

      // Each permission should have all 5 roles
      Object.values(table).forEach((roleMap) => {
        expect(Object.keys(roleMap)).toHaveLength(5);
        expect(roleMap).toHaveProperty(OrganizationRole.OWNER);
        expect(roleMap).toHaveProperty(OrganizationRole.ADMIN);
        expect(roleMap).toHaveProperty(OrganizationRole.EDITOR);
        expect(roleMap).toHaveProperty(OrganizationRole.PUBLISHER);
        expect(roleMap).toHaveProperty(OrganizationRole.VIEWER);
      });
    });

    it('should have boolean values for all role-permission combinations', () => {
      const table = getPermissionsTable();

      Object.values(table).forEach((roleMap) => {
        Object.values(roleMap).forEach((hasAccess) => {
          expect(typeof hasAccess).toBe('boolean');
        });
      });
    });

    it('should match hasPermission results', () => {
      const table = getPermissionsTable();

      // Verify a few key combinations
      expect(table[Permission.MANAGE_BILLING][OrganizationRole.OWNER]).toBe(true);
      expect(table[Permission.MANAGE_BILLING][OrganizationRole.ADMIN]).toBe(false);
      expect(table[Permission.CREATE_POSTS][OrganizationRole.EDITOR]).toBe(true);
      expect(table[Permission.CREATE_POSTS][OrganizationRole.PUBLISHER]).toBe(false);
      expect(table[Permission.VIEW_POSTS][OrganizationRole.VIEWER]).toBe(true);
    });
  });

  describe('Role Hierarchy Verification', () => {
    it('should enforce OWNER > ADMIN hierarchy', () => {
      const ownerPermissions = getRolePermissions(OrganizationRole.OWNER);
      const adminPermissions = getRolePermissions(OrganizationRole.ADMIN);

      // OWNER should have all ADMIN permissions plus more
      adminPermissions.forEach((permission) => {
        expect(ownerPermissions).toContain(permission);
      });

      expect(ownerPermissions.length).toBeGreaterThan(adminPermissions.length);
    });

    it('should enforce ADMIN > EDITOR hierarchy', () => {
      const adminPermissions = getRolePermissions(OrganizationRole.ADMIN);
      const editorPermissions = getRolePermissions(OrganizationRole.EDITOR);

      // ADMIN should have all EDITOR permissions plus more
      editorPermissions.forEach((permission) => {
        expect(adminPermissions).toContain(permission);
      });

      expect(adminPermissions.length).toBeGreaterThan(editorPermissions.length);
    });

    it('should enforce EDITOR > PUBLISHER hierarchy', () => {
      const editorPermissions = getRolePermissions(OrganizationRole.EDITOR);
      const publisherPermissions = getRolePermissions(OrganizationRole.PUBLISHER);

      // EDITOR should have all PUBLISHER permissions plus more
      publisherPermissions.forEach((permission) => {
        expect(editorPermissions).toContain(permission);
      });

      expect(editorPermissions.length).toBeGreaterThan(publisherPermissions.length);
    });

    it('should enforce PUBLISHER > VIEWER hierarchy', () => {
      const publisherPermissions = getRolePermissions(OrganizationRole.PUBLISHER);
      const viewerPermissions = getRolePermissions(OrganizationRole.VIEWER);

      // PUBLISHER should have all VIEWER permissions plus more
      viewerPermissions.forEach((permission) => {
        expect(publisherPermissions).toContain(permission);
      });

      expect(publisherPermissions.length).toBeGreaterThan(viewerPermissions.length);
    });
  });
});
