import { Request, Response } from 'express';
import { rbacService } from './rbac.service';
import { validateCreateRole, validateUpdateRole } from '../../shared/validators';
import { createSuccessResponse } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { AuthError } from '../../shared/errors';
import type { CreateRoleRequest, UpdateRoleRequest } from './rbac.types';
import { getPermissionCatalogue } from '../../shared/constants/permissions';
import { platformPrisma } from '../../config/database';

export class RbacController {
  // List roles for the current tenant
  listRoles = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw AuthError.tenantNotFound();

    const roles = await rbacService.listRoles(tenantId);
    res.json(createSuccessResponse(roles, 'Roles retrieved successfully'));
  });

  // Get a single role
  getRole = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw AuthError.tenantNotFound();

    const role = await rbacService.getRole(req.params.id!, tenantId);
    res.json(createSuccessResponse(role));
  });

  // Create a new role
  createRole = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw AuthError.tenantNotFound();

    const data = validateCreateRole(req.body);
    const role = await rbacService.createRole(tenantId, data as CreateRoleRequest);
    res.status(201).json(createSuccessResponse(role, 'Role created successfully'));
  });

  // Update a role
  updateRole = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw AuthError.tenantNotFound();

    const data = validateUpdateRole(req.body);
    const role = await rbacService.updateRole(req.params.id!, tenantId, data as UpdateRoleRequest);
    res.json(createSuccessResponse(role, 'Role updated successfully'));
  });

  // Delete a role
  deleteRole = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw AuthError.tenantNotFound();

    await rbacService.deleteRole(req.params.id!, tenantId);
    res.json(createSuccessResponse(null, 'Role deleted successfully'));
  });

  // Assign a role to a user
  assignRole = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw AuthError.tenantNotFound();

    const { userId, roleId } = req.body;
    await rbacService.assignRole(tenantId, userId, roleId);
    res.json(createSuccessResponse(null, 'Role assigned successfully'));
  });

  // Get the permission catalogue (flat list + structured modules)
  getPermissions = asyncHandler(async (_req: Request, res: Response) => {
    const flat = rbacService.getPermissionCatalogue();
    const modules = getPermissionCatalogue();
    res.json(createSuccessResponse({ permissions: flat, modules }, 'Permissions retrieved successfully'));
  });

  // Get reference role templates
  getReferenceRoles = asyncHandler(async (_req: Request, res: Response) => {
    const referenceRoles = rbacService.getReferenceRoles();
    res.json(createSuccessResponse(referenceRoles, 'Reference roles retrieved successfully'));
  });

  getNavigationManifest = asyncHandler(async (req: Request, res: Response) => {
    const userPermissions = req.user?.permissions ?? [];
    const userRole = req.user?.roleId ?? 'COMPANY_ADMIN';
    const companyId = req.user?.companyId;

    let activeModuleIds: string[] = [];
    if (companyId) {
      const company = await platformPrisma.company.findUnique({
        where: { id: companyId },
        select: { selectedModuleIds: true },
      });
      if (company?.selectedModuleIds) {
        activeModuleIds = Array.isArray(company.selectedModuleIds)
          ? company.selectedModuleIds as string[]
          : typeof company.selectedModuleIds === 'string'
            ? JSON.parse(company.selectedModuleIds)
            : [];
      }

      // Fallback: if company-level modules are empty, aggregate from locations
      if (activeModuleIds.length === 0) {
        const locations = await platformPrisma.location.findMany({
          where: { companyId },
          select: { moduleIds: true },
        });
        const locModules = locations.flatMap(l =>
          l.moduleIds
            ? (Array.isArray(l.moduleIds) ? l.moduleIds as string[] : JSON.parse(l.moduleIds as string))
            : [],
        );
        activeModuleIds = Array.from(new Set(locModules));
      }
    }

    const manifestParams: Parameters<typeof rbacService.getNavigationManifest>[0] = {
      userPermissions,
      userRole,
      activeModuleIds,
    };
    if (companyId) manifestParams.companyId = companyId;

    const manifest = await rbacService.getNavigationManifest(manifestParams);

    res.json(createSuccessResponse(manifest, 'Navigation manifest retrieved'));
  });

  // Sync Company Admin permissions across all tenants (platform admin only)
  syncCompanyAdminPermissions = asyncHandler(async (_req: Request, res: Response) => {
    const result = await rbacService.syncCompanyAdminPermissions();
    res.json(createSuccessResponse(result, `Company Admin permissions synced: ${result.updated} updated, ${result.skipped} already current`));
  });
}

export const rbacController = new RbacController();
