import { platformPrisma } from '../../config/database';
import { cacheRedis } from '../../config/redis';
import { ApiError } from '../../shared/errors/api-error';
import { AuthError } from '../../shared/errors';
import { HttpStatus } from '../../shared/types';
import { logger } from '../../config/logger';
import { getAllPermissions, REFERENCE_ROLE_PERMISSIONS, hasPermission } from '../../shared/constants/permissions';
import { NAVIGATION_MANIFEST, getGroupedNavigation, type NavigationItem } from '../../shared/constants/navigation-manifest';
import { createUserCacheKey, createUserPermissionsCacheKey } from '../../shared/utils';
import { getCachedSystemControls, getCachedESSConfig } from '../../shared/utils/config-cache';
import { notificationService } from '../notifications/notification.service';
import { CreateRoleRequest, UpdateRoleRequest, RoleResponse } from './rbac.types';

// ── Nav Item → ESSConfig field mapping ──────────────────────────────
// When the ESS config field is false, the nav item is hidden from sidebar.
const NAV_TO_ESS_CONFIG: Record<string, string> = {
  'ess-payslips': 'viewPayslips',
  'ess-leave': 'leaveApplication',
  'ess-attendance': 'attendanceView',
  'ess-checkin': 'attendanceView',
  'ess-holidays': 'holidayCalendar',
  'ess-goals': 'performanceGoals',
  'ess-it-dec': 'itDeclaration',
  'ess-form16': 'downloadForm16',
  'ess-grievance': 'grievanceSubmission',
  'ess-training': 'trainingEnrollment',
  'ess-assets': 'assetView',
  'ess-shift-swap': 'shiftSwapRequest',
  'ess-wfh': 'wfhRequest',
  'ess-documents': 'documentUpload',
  'ess-policies': 'policyDocuments',
  'ess-expense-claims': 'reimbursementClaims',
  'ess-loans': 'loanApplication',
  'ess-org-chart': 'viewOrgChart',
  'ess-appraisal': 'appraisalAccess',
  'ess-chatbot': 'aiChatbotEnabled', // special: checked against SystemControls
  'ess-helpdesk': 'helpDesk',
  // Manager self-service
  'mss-team': 'mssViewTeam',
  'mss-approvals': 'mssApproveLeave',
};

// ── Nav Item → SystemControls module field ──────────────────────────
// When the module is disabled in SystemControls, hide ALL related nav items.
const NAV_TO_SYSTEM_MODULE: Record<string, string> = {
  'ess-chatbot': 'aiChatbotEnabled',
  'hr-requisitions': 'recruitmentEnabled',
  'hr-candidates': 'recruitmentEnabled',
  'hr-offers': 'recruitmentEnabled',
  'hr-analytics-recruitment': 'recruitmentEnabled',
  'hr-training': 'trainingEnabled',
  'hr-training-sessions': 'trainingEnabled',
  'hr-trainers': 'trainingEnabled',
  'hr-training-programs': 'trainingEnabled',
  'hr-training-budgets': 'trainingEnabled',
  'hr-nominations': 'trainingEnabled',
  'ess-training': 'trainingEnabled',
  'hr-analytics-training': 'trainingEnabled',
};

export class RbacService {
  // List all roles for a tenant
  async listRoles(tenantId: string): Promise<RoleResponse[]> {
    const roles = await platformPrisma.role.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });

    return roles.map((r) => ({
      ...r,
      permissions: r.permissions as string[],
    }));
  }

  // Get a single role by ID
  async getRole(roleId: string, tenantId: string): Promise<RoleResponse> {
    const role = await platformPrisma.role.findFirst({
      where: { id: roleId, tenantId },
    });

    if (!role) {
      throw new ApiError('Role not found', HttpStatus.NOT_FOUND, true, 'ROLE_NOT_FOUND');
    }

    return { ...role, permissions: role.permissions as string[] };
  }

  // Create a custom role
  async createRole(tenantId: string, data: CreateRoleRequest): Promise<RoleResponse> {
    // Check for duplicate name
    const existing = await platformPrisma.role.findUnique({
      where: { tenantId_name: { tenantId, name: data.name } },
    });

    if (existing) {
      throw new ApiError('A role with this name already exists', HttpStatus.CONFLICT, true, 'ROLE_DUPLICATE');
    }

    const role = await platformPrisma.role.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description ?? null,
        permissions: data.permissions,
        isSystem: false,
      },
    });

    logger.info(`Role created: ${role.name} for tenant ${tenantId}`);
    return { ...role, permissions: role.permissions as string[] };
  }

  // Update a role (prevent modifying system roles)
  async updateRole(roleId: string, tenantId: string, data: UpdateRoleRequest): Promise<RoleResponse> {
    const role = await platformPrisma.role.findFirst({
      where: { id: roleId, tenantId },
    });

    if (!role) {
      throw new ApiError('Role not found', HttpStatus.NOT_FOUND, true, 'ROLE_NOT_FOUND');
    }

    if (role.isSystem) {
      throw new ApiError('System roles cannot be modified', HttpStatus.FORBIDDEN, true, 'ROLE_SYSTEM_PROTECTED');
    }

    // Check for duplicate name if name is being changed
    if (data.name && data.name !== role.name) {
      const existing = await platformPrisma.role.findUnique({
        where: { tenantId_name: { tenantId, name: data.name } },
      });
      if (existing) {
        throw new ApiError('A role with this name already exists', HttpStatus.CONFLICT, true, 'ROLE_DUPLICATE');
      }
    }

    const updated = await platformPrisma.role.update({
      where: { id: roleId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.permissions !== undefined && { permissions: data.permissions }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });

    // Invalidate cached permissions for all users with this role
    await this.invalidateRolePermissionsCache(roleId);

    logger.info(`Role updated: ${updated.name} (${roleId}) for tenant ${tenantId}`);
    return { ...updated, permissions: updated.permissions as string[] };
  }

  // Soft-delete a role (set isActive = false)
  async deleteRole(roleId: string, tenantId: string): Promise<void> {
    const role = await platformPrisma.role.findFirst({
      where: { id: roleId, tenantId },
    });

    if (!role) {
      throw new ApiError('Role not found', HttpStatus.NOT_FOUND, true, 'ROLE_NOT_FOUND');
    }

    if (role.isSystem) {
      throw new ApiError('System roles cannot be deleted', HttpStatus.FORBIDDEN, true, 'ROLE_SYSTEM_PROTECTED');
    }

    // Check if any users are assigned to this role
    const assignedUsers = await platformPrisma.tenantUser.count({
      where: { roleId, isActive: true },
    });

    if (assignedUsers > 0) {
      throw new ApiError(
        `Cannot delete role: ${assignedUsers} user(s) are still assigned to it`,
        HttpStatus.CONFLICT,
        true,
        'ROLE_HAS_USERS'
      );
    }

    await platformPrisma.role.update({
      where: { id: roleId },
      data: { isActive: false },
    });

    logger.info(`Role deleted: ${role.name} (${roleId}) for tenant ${tenantId}`);
  }

  // Assign a role to a user within a tenant
  async assignRole(tenantId: string, userId: string, roleId: string): Promise<void> {
    // Verify role belongs to this tenant
    const role = await platformPrisma.role.findFirst({
      where: { id: roleId, tenantId, isActive: true },
    });

    if (!role) {
      throw new ApiError('Role not found', HttpStatus.NOT_FOUND, true, 'ROLE_NOT_FOUND');
    }

    // Determine the platform-level UserRole based on the tenant role.
    // Only the system "Company Admin" role gets COMPANY_ADMIN; all others get USER.
    // This ensures the auth system respects TenantUser→Role permissions for non-admins.
    const isCompanyAdminRole = role.isSystem && role.name === 'Company Admin';
    const platformRole = isCompanyAdminRole ? 'COMPANY_ADMIN' : 'USER';

    // Upsert tenant user record + sync User.role
    await platformPrisma.$transaction([
      platformPrisma.tenantUser.upsert({
        where: { userId_tenantId: { userId, tenantId } },
        create: { userId, tenantId, roleId },
        update: { roleId, isActive: true },
      }),
      platformPrisma.user.update({
        where: { id: userId },
        data: { role: platformRole },
      }),
    ]);

    // Invalidate user's cached permissions
    await cacheRedis.del(createUserCacheKey(userId, 'auth'));
    await cacheRedis.del(createUserPermissionsCacheKey(userId, tenantId));

    logger.info(`Role ${role.name} (platform: ${platformRole}) assigned to user ${userId} in tenant ${tenantId}`);

    // Notify the user that their role changed. HIGH + systemCritical
    // because permission changes alter what the user can access.
    try {
      const targetUser = await platformPrisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, companyId: true },
      });
      if (targetUser?.companyId) {
        await notificationService.dispatch({
          companyId: targetUser.companyId,
          triggerEvent: 'USER_ROLE_CHANGED',
          entityType: 'User',
          entityId: userId,
          explicitRecipients: [userId],
          tokens: {
            user_name: `${targetUser.firstName ?? ''} ${targetUser.lastName ?? ''}`.trim(),
            role_name: role.name,
          },
          priority: 'HIGH',
          systemCritical: true,
          type: 'AUTH',
        });
      }
    } catch (err) {
      logger.warn('Role assigned dispatch failed (non-blocking)', { error: err, userId });
    }
  }

  // Get permissions for a user in a specific tenant (used by auth middleware)
  async getUserPermissions(userId: string, tenantId: string): Promise<string[]> {
    // Check cache first
    const cacheKey = createUserPermissionsCacheKey(userId, tenantId);
    const cached = await cacheRedis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const tenantUser = await platformPrisma.tenantUser.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      include: { role: true },
    });

    if (!tenantUser || !tenantUser.isActive) {
      return [];
    }

    const permissions = tenantUser.role.permissions as string[];

    // Cache for 30 minutes
    await cacheRedis.setex(cacheKey, 1800, JSON.stringify(permissions));

    return permissions;
  }

  // Get the full permission catalogue
  getPermissionCatalogue() {
    return getAllPermissions();
  }

  // Get reference roles (templates for onboarding)
  getReferenceRoles() {
    return REFERENCE_ROLE_PERMISSIONS;
  }

  // Seed default roles for a new tenant
  async seedDefaultRoles(tenantId: string): Promise<void> {
    const defaultRoles = ['General Manager', 'HR Personnel', 'Finance Team', 'Production Manager', 'Security Personnel'];

    for (const roleName of defaultRoles) {
      const ref = REFERENCE_ROLE_PERMISSIONS[roleName];
      if (!ref) continue;

      await platformPrisma.role.create({
        data: {
          tenantId,
          name: roleName,
          description: ref.description,
          permissions: ref.permissions,
          isSystem: true,
        },
      });
    }

    logger.info(`Default roles seeded for tenant ${tenantId}`);
  }

  async getNavigationManifest(params: {
    userPermissions: string[];
    userRole: string;
    activeModuleIds: string[];
    companyId?: string;
  }) {
    const { userPermissions, userRole, activeModuleIds, companyId } = params;
    const isSuperAdmin = userRole === 'SUPER_ADMIN';

    // Fetch config for ESS/SystemControls feature gating (company users only)
    let essConfig: Record<string, unknown> = {};
    let systemControls: Record<string, unknown> = {};
    if (companyId && !isSuperAdmin) {
      try {
        const [ess, sys] = await Promise.all([
          getCachedESSConfig(companyId),
          getCachedSystemControls(companyId),
        ]);
        essConfig = (ess ?? {}) as Record<string, unknown>;
        systemControls = (sys ?? {}) as Record<string, unknown>;
      } catch {
        // Non-fatal: if config fetch fails, show all items (permissive fallback)
      }
    }

    const isCompanyAdmin = userRole === 'COMPANY_ADMIN';
    // Subscription is enforced for employees/managers via permissions + module list.
    // Company admins must see the full company nav to configure modules and HR/ops —
    // selectedModuleIds is often empty or incomplete while onboarding; do not hide by module.
    const bypassModuleSubscription = isCompanyAdmin;

    // Debug: log inputs to help diagnose missing nav items
    logger.debug('nav_manifest_filter_inputs', {
      userRole,
      isCompanyAdmin,
      isSuperAdmin,
      bypassModuleSubscription,
      permissionCount: userPermissions.length,
      hasWildcard: userPermissions.includes('*'),
      activeModuleIds,
      essConfigKeys: Object.keys(essConfig),
      systemControlsKeys: Object.keys(systemControls),
    });

    const filtered = NAVIGATION_MANIFEST.filter((item) => {
      // Role scope filter
      if (item.roleScope === 'super_admin' && !isSuperAdmin) return false;
      if (item.roleScope === 'company' && isSuperAdmin) return false;

      // Module subscription filter (skip for system items with module: null)
      if (
        item.module &&
        !bypassModuleSubscription &&
        !activeModuleIds.includes(item.module)
      ) {
        logger.debug('nav_item_filtered_by_module', { id: item.id, module: item.module });
        return false;
      }

      // Permission filter
      if (item.requiredPerm && !hasPermission(userPermissions, item.requiredPerm)) {
        logger.debug('nav_item_filtered_by_permission', { id: item.id, requiredPerm: item.requiredPerm });
        return false;
      }

      // SystemControls module enablement filter
      const sysField = NAV_TO_SYSTEM_MODULE[item.id];
      if (sysField && systemControls[sysField] === false) {
        logger.debug('nav_item_filtered_by_system_controls', { id: item.id, sysField });
        return false;
      }

      // ESS config feature filter (only for ess-* and mss-* items)
      const essField = NAV_TO_ESS_CONFIG[item.id];
      if (essField) {
        // For aiChatbotEnabled, check SystemControls instead of ESSConfig
        if (essField === 'aiChatbotEnabled') {
          if (systemControls[essField] === false) return false;
        } else if (essConfig[essField] === false) {
          logger.debug('nav_item_filtered_by_ess_config', { id: item.id, essField, value: essConfig[essField] });
          return false;
        }
      }

      return true;
    });

    return getGroupedNavigation(filtered);
  }

  // Invalidate cached permissions for all users with a specific role
  private async invalidateRolePermissionsCache(roleId: string): Promise<void> {
    const tenantUsers = await platformPrisma.tenantUser.findMany({
      where: { roleId },
      select: { userId: true, tenantId: true },
    });

    for (const tu of tenantUsers) {
      await cacheRedis.del(createUserCacheKey(tu.userId, 'auth'));
      await cacheRedis.del(createUserPermissionsCacheKey(tu.userId, tu.tenantId));
    }
  }
}

export const rbacService = new RbacService();
