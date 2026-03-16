/**
 * Unit tests for RbacService
 *
 * Source file: src/core/rbac/rbac.service.ts
 *
 * External dependencies mocked:
 *   - config/database  (platformPrisma)
 *   - config/redis     (cacheRedis)
 *   - config/logger    (suppress output)
 */

jest.mock('../../../config/database', () => ({
  platformPrisma: {
    role: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    tenantUser: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  },
}));

jest.mock('../../../config/redis', () => ({
  cacheRedis: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { RbacService } from '../rbac.service';
import { platformPrisma } from '../../../config/database';
import { cacheRedis } from '../../../config/redis';
import { createUserCacheKey, createUserPermissionsCacheKey } from '../../../shared/utils';

const mockRole = platformPrisma.role as any;
const mockTenantUser = platformPrisma.tenantUser as any;
const mockRedis = cacheRedis as jest.Mocked<typeof cacheRedis>;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-1';

const roleFixture = {
  id: 'role-uuid-1',
  tenantId: TENANT_ID,
  name: 'HR Personnel',
  description: 'Full HR module access',
  permissions: ['hr:view', 'hr:create'],
  isSystem: false,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RbacService', () => {
  let service: RbacService;

  beforeEach(() => {
    service = new RbacService();
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    mockRedis.del.mockResolvedValue(1);
  });

  // =========================================================================
  // listRoles
  // =========================================================================

  describe('listRoles', () => {
    it('should return all active roles for a tenant', async () => {
      mockRole.findMany.mockResolvedValueOnce([roleFixture] as any);

      const result = await service.listRoles(TENANT_ID);

      expect(mockRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID, isActive: true } })
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('HR Personnel');
    });

    it('should return an empty array when the tenant has no roles', async () => {
      mockRole.findMany.mockResolvedValueOnce([]);

      const result = await service.listRoles(TENANT_ID);
      expect(result).toEqual([]);
    });
  });

  // =========================================================================
  // createRole
  // =========================================================================

  describe('createRole', () => {
    const createData = {
      name: 'Finance Team',
      description: 'Finance module access',
      permissions: ['finance:view', 'finance:create'],
    };

    it('should create and return a new role', async () => {
      mockRole.findUnique.mockResolvedValueOnce(null); // no duplicate
      mockRole.create.mockResolvedValueOnce({ ...roleFixture, ...createData, id: 'role-uuid-2' } as any);

      const result = await service.createRole(TENANT_ID, createData);

      expect(mockRole.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_ID,
            name: 'Finance Team',
            isSystem: false,
          }),
        })
      );
      expect(result.name).toBe('Finance Team');
    });

    it('should throw ROLE_DUPLICATE when a role with the same name already exists', async () => {
      mockRole.findUnique.mockResolvedValueOnce(roleFixture as any);

      await expect(service.createRole(TENANT_ID, createData))
        .rejects.toMatchObject({ code: 'ROLE_DUPLICATE', statusCode: 409 });
    });
  });

  // =========================================================================
  // updateRole
  // =========================================================================

  describe('updateRole', () => {
    it('should update and return the modified role', async () => {
      mockRole.findFirst.mockResolvedValueOnce(roleFixture as any);
      const updated = { ...roleFixture, name: 'HR Lead' };
      mockRole.update.mockResolvedValueOnce(updated as any);
      // invalidateRolePermissionsCache calls tenantUser.findMany
      mockTenantUser.findMany.mockResolvedValueOnce([]);

      const result = await service.updateRole('role-uuid-1', TENANT_ID, { name: 'HR Lead' });

      expect(result.name).toBe('HR Lead');
    });

    it('should throw ROLE_NOT_FOUND when role does not exist for tenant', async () => {
      mockRole.findFirst.mockResolvedValueOnce(null);

      await expect(service.updateRole('ghost-role', TENANT_ID, { name: 'X' }))
        .rejects.toMatchObject({ code: 'ROLE_NOT_FOUND', statusCode: 404 });
    });

    it('should throw ROLE_SYSTEM_PROTECTED when trying to modify a system role', async () => {
      mockRole.findFirst.mockResolvedValueOnce({ ...roleFixture, isSystem: true } as any);

      await expect(service.updateRole('role-uuid-1', TENANT_ID, { name: 'X' }))
        .rejects.toMatchObject({ code: 'ROLE_SYSTEM_PROTECTED', statusCode: 403 });
    });

    it('should throw ROLE_DUPLICATE when renaming to a name that is already in use', async () => {
      mockRole.findFirst.mockResolvedValueOnce(roleFixture as any); // found the role
      // Duplicate name check returns existing role with that name
      mockRole.findUnique.mockResolvedValueOnce({ ...roleFixture, id: 'other-id', name: 'Existing Name' } as any);

      await expect(service.updateRole('role-uuid-1', TENANT_ID, { name: 'Existing Name' }))
        .rejects.toMatchObject({ code: 'ROLE_DUPLICATE' });
    });

    it('should invalidate cache for all users with the updated role', async () => {
      const tenantUsers = [
        { userId: 'u1', tenantId: TENANT_ID },
        { userId: 'u2', tenantId: TENANT_ID },
      ];
      mockRole.findFirst.mockResolvedValueOnce(roleFixture as any);
      mockRole.update.mockResolvedValueOnce(roleFixture as any);
      mockTenantUser.findMany.mockResolvedValueOnce(tenantUsers as any);

      await service.updateRole('role-uuid-1', TENANT_ID, { description: 'Updated desc' });

      // del should be called for each user (auth key + permission key)
      expect(mockRedis.del).toHaveBeenCalledTimes(tenantUsers.length * 2);
    });
  });

  // =========================================================================
  // deleteRole
  // =========================================================================

  describe('deleteRole', () => {
    it('should soft-delete a non-system role with no assigned users', async () => {
      mockRole.findFirst.mockResolvedValueOnce(roleFixture as any);
      mockTenantUser.count.mockResolvedValueOnce(0);
      mockRole.update.mockResolvedValueOnce({ ...roleFixture, isActive: false } as any);

      await expect(service.deleteRole('role-uuid-1', TENANT_ID))
        .resolves.toBeUndefined();

      expect(mockRole.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { isActive: false } })
      );
    });

    it('should throw ROLE_NOT_FOUND when role does not exist', async () => {
      mockRole.findFirst.mockResolvedValueOnce(null);

      await expect(service.deleteRole('ghost-role', TENANT_ID))
        .rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' });
    });

    it('should throw ROLE_SYSTEM_PROTECTED when trying to delete a system role', async () => {
      mockRole.findFirst.mockResolvedValueOnce({ ...roleFixture, isSystem: true } as any);

      await expect(service.deleteRole('role-uuid-1', TENANT_ID))
        .rejects.toMatchObject({ code: 'ROLE_SYSTEM_PROTECTED', statusCode: 403 });
    });

    it('should throw ROLE_HAS_USERS when one or more users are still assigned to the role', async () => {
      mockRole.findFirst.mockResolvedValueOnce(roleFixture as any);
      mockTenantUser.count.mockResolvedValueOnce(3); // 3 users assigned

      await expect(service.deleteRole('role-uuid-1', TENANT_ID))
        .rejects.toMatchObject({ code: 'ROLE_HAS_USERS', statusCode: 409 });
    });
  });

  // =========================================================================
  // assignRole
  // =========================================================================

  describe('assignRole', () => {
    it('should upsert the TenantUser record with the new roleId', async () => {
      mockRole.findFirst.mockResolvedValueOnce({ ...roleFixture, isActive: true } as any);
      mockTenantUser.upsert.mockResolvedValueOnce({} as any);

      await expect(
        service.assignRole(TENANT_ID, 'user-uuid-1', 'role-uuid-1')
      ).resolves.toBeUndefined();

      expect(mockTenantUser.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_tenantId: { userId: 'user-uuid-1', tenantId: TENANT_ID } },
          create: expect.objectContaining({ roleId: 'role-uuid-1' }),
          update: expect.objectContaining({ roleId: 'role-uuid-1', isActive: true }),
        })
      );
    });

    it('should clear the user auth cache after assigning a role', async () => {
      mockRole.findFirst.mockResolvedValueOnce({ ...roleFixture, isActive: true } as any);
      mockTenantUser.upsert.mockResolvedValueOnce({} as any);

      await service.assignRole(TENANT_ID, 'user-uuid-1', 'role-uuid-1');

      expect(mockRedis.del).toHaveBeenCalledWith(createUserCacheKey('user-uuid-1', 'auth'));
    });

    it('should throw ROLE_NOT_FOUND when role does not belong to this tenant or is inactive', async () => {
      mockRole.findFirst.mockResolvedValueOnce(null);

      await expect(service.assignRole(TENANT_ID, 'user-uuid-1', 'wrong-role'))
        .rejects.toMatchObject({ code: 'ROLE_NOT_FOUND' });
    });
  });

  // =========================================================================
  // getUserPermissions
  // =========================================================================

  describe('getUserPermissions', () => {
    const CACHE_KEY = createUserPermissionsCacheKey('user-uuid-1', TENANT_ID);

    it('should return cached permissions without hitting the database', async () => {
      const perms = ['hr:view', 'hr:create'];
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(perms));

      const result = await service.getUserPermissions('user-uuid-1', TENANT_ID);

      expect(result).toEqual(perms);
      expect(mockTenantUser.findUnique).not.toHaveBeenCalled();
    });

    it('should fetch from database on cache miss and cache the result', async () => {
      mockRedis.get.mockResolvedValueOnce(null); // cache miss
      mockTenantUser.findUnique.mockResolvedValueOnce({
        isActive: true,
        role: { permissions: ['finance:view', 'finance:create'] },
      } as any);

      const result = await service.getUserPermissions('user-uuid-1', TENANT_ID);

      expect(result).toEqual(['finance:view', 'finance:create']);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        CACHE_KEY,
        1800,
        JSON.stringify(['finance:view', 'finance:create'])
      );
    });

    it('should return an empty array when no TenantUser record exists', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockTenantUser.findUnique.mockResolvedValueOnce(null);

      const result = await service.getUserPermissions('user-uuid-1', TENANT_ID);

      expect(result).toEqual([]);
    });

    it('should return an empty array when TenantUser record is inactive', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      mockTenantUser.findUnique.mockResolvedValueOnce({
        isActive: false,
        role: { permissions: ['hr:view'] },
      } as any);

      const result = await service.getUserPermissions('user-uuid-1', TENANT_ID);

      expect(result).toEqual([]);
    });
  });
});
