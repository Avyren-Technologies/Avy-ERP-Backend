/**
 * Unit tests for permission utility functions and constants
 *
 * Source file: src/shared/constants/permissions.ts
 *
 * No external dependencies — pure functions only, no mocking required.
 */

import {
  getAllPermissions,
  hasPermission,
  PERMISSION_MODULES,
  REFERENCE_ROLE_PERMISSIONS,
} from '../permissions';

// ---------------------------------------------------------------------------
// getAllPermissions
// ---------------------------------------------------------------------------

describe('getAllPermissions', () => {
  it('should return a non-empty array of permission strings', () => {
    const perms = getAllPermissions();
    expect(Array.isArray(perms)).toBe(true);
    expect(perms.length).toBeGreaterThan(0);
  });

  it('should return strings in the format "module:action"', () => {
    const perms = getAllPermissions();
    perms.forEach((p) => {
      expect(p).toMatch(/^[a-z]+:[a-z]+$/);
    });
  });

  it('should include every module defined in PERMISSION_MODULES', () => {
    const perms = getAllPermissions();
    const modules = Object.keys(PERMISSION_MODULES);
    modules.forEach((mod) => {
      const matchingPerms = perms.filter((p) => p.startsWith(`${mod}:`));
      expect(matchingPerms.length).toBeGreaterThan(0);
    });
  });

  it('should include hr:view and hr:create', () => {
    const perms = getAllPermissions();
    expect(perms).toContain('hr:view');
    expect(perms).toContain('hr:create');
  });

  it('should include all actions for the hr module', () => {
    const perms = getAllPermissions();
    const hrActions = PERMISSION_MODULES.hr.actions;
    hrActions.forEach((action) => {
      expect(perms).toContain(`hr:${action}`);
    });
  });

  it('should not contain duplicate entries', () => {
    const perms = getAllPermissions();
    const unique = new Set(perms);
    expect(unique.size).toBe(perms.length);
  });
});

// ---------------------------------------------------------------------------
// hasPermission
// ---------------------------------------------------------------------------

describe('hasPermission', () => {
  // -------------------------------------------------------------------------
  // Wildcard '*' — grants everything
  // -------------------------------------------------------------------------

  describe('with wildcard "*"', () => {
    it('should grant access to any specific permission', () => {
      expect(hasPermission(['*'], 'hr:delete')).toBe(true);
      expect(hasPermission(['*'], 'finance:approve')).toBe(true);
      expect(hasPermission(['*'], 'audit:view')).toBe(true);
    });

    it('should grant access even to permissions from modules not in the catalogue', () => {
      expect(hasPermission(['*'], 'platform:admin')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Module wildcard 'module:*'
  // -------------------------------------------------------------------------

  describe('with module wildcard (e.g. "hr:*")', () => {
    it('should grant access to any action in the matching module', () => {
      const userPerms = ['hr:*'];
      expect(hasPermission(userPerms, 'hr:view')).toBe(true);
      expect(hasPermission(userPerms, 'hr:create')).toBe(true);
      expect(hasPermission(userPerms, 'hr:delete')).toBe(true);
      expect(hasPermission(userPerms, 'hr:approve')).toBe(true);
    });

    it('should NOT grant access to actions in a different module', () => {
      expect(hasPermission(['hr:*'], 'finance:view')).toBe(false);
      expect(hasPermission(['production:*'], 'hr:view')).toBe(false);
    });

    it('should work for multiple module wildcards', () => {
      const userPerms = ['hr:*', 'finance:*'];
      expect(hasPermission(userPerms, 'hr:delete')).toBe(true);
      expect(hasPermission(userPerms, 'finance:approve')).toBe(true);
      expect(hasPermission(userPerms, 'inventory:view')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Exact match
  // -------------------------------------------------------------------------

  describe('with exact permission match', () => {
    it('should grant access when the exact permission is present', () => {
      expect(hasPermission(['hr:view', 'hr:create'], 'hr:view')).toBe(true);
    });

    it('should NOT grant access for a different action in the same module', () => {
      expect(hasPermission(['hr:view'], 'hr:delete')).toBe(false);
    });

    it('should be case-sensitive (permissions are lowercase by convention)', () => {
      // 'HR:view' is NOT the same as 'hr:view'
      expect(hasPermission(['HR:view'], 'hr:view')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // No match
  // -------------------------------------------------------------------------

  describe('with no matching permission', () => {
    it('should return false when userPermissions is empty', () => {
      expect(hasPermission([], 'hr:view')).toBe(false);
    });

    it('should return false when userPermissions has unrelated permissions', () => {
      expect(hasPermission(['sales:view', 'sales:create'], 'hr:view')).toBe(false);
    });

    it('should return false for a module wildcard that targets a different module', () => {
      expect(hasPermission(['production:*'], 'hr:view')).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should return false when userPermissions contains an empty string', () => {
      expect(hasPermission([''], 'hr:view')).toBe(false);
    });

    it('should NOT treat "hr:*" in userPermissions as matching "*" required permission', () => {
      // A user with only hr module access should not pass a global '*' check
      expect(hasPermission(['hr:*'], '*')).toBe(false);
    });

    it('should handle required permission with no colon gracefully', () => {
      // An unusual required value should not crash
      expect(hasPermission(['hr:view'], 'somePermissionWithNoColon')).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// REFERENCE_ROLE_PERMISSIONS — sanity checks for known roles
// ---------------------------------------------------------------------------

describe('REFERENCE_ROLE_PERMISSIONS', () => {
  it('should define at least 10 reference roles', () => {
    const roleNames = Object.keys(REFERENCE_ROLE_PERMISSIONS);
    expect(roleNames.length).toBeGreaterThanOrEqual(10);
  });

  it('every reference role should have a non-empty description', () => {
    Object.values(REFERENCE_ROLE_PERMISSIONS).forEach((role) => {
      expect(role.description).toBeTruthy();
    });
  });

  it('every reference role should have at least one permission', () => {
    Object.values(REFERENCE_ROLE_PERMISSIONS).forEach((role) => {
      expect(role.permissions.length).toBeGreaterThan(0);
    });
  });

  it('HR Personnel should include hr:* in their permissions', () => {
    expect(REFERENCE_ROLE_PERMISSIONS['HR Personnel']!.permissions).toContain('hr:*');
  });

  it('General Manager should have only read/export permissions (no edit/delete)', () => {
    const perms = REFERENCE_ROLE_PERMISSIONS['General Manager']!.permissions;
    const hasWritePerms = perms.some((p) => p.includes(':create') || p.includes(':delete') || p.includes(':edit'));
    expect(hasWritePerms).toBe(false);
  });

  it('Security Personnel should have security:* and visitor:* permissions', () => {
    const perms = REFERENCE_ROLE_PERMISSIONS['Security Personnel']!.permissions;
    expect(perms).toContain('security:*');
    expect(perms).toContain('visitor:*');
  });

  it('Auditor role should have view access to all defined modules', () => {
    const auditorPerms = REFERENCE_ROLE_PERMISSIONS['Auditor']!.permissions;
    const modules = Object.keys(PERMISSION_MODULES);
    modules.forEach((mod) => {
      expect(auditorPerms).toContain(`${mod}:view`);
    });
  });
});
