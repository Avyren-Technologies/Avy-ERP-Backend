import { Request, Response } from 'express';
import { rbacService } from './rbac.service';
import { validateCreateRole, validateUpdateRole } from '../../shared/validators';
import { createSuccessResponse } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { AuthError } from '../../shared/errors';

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
    const role = await rbacService.createRole(tenantId, data);
    res.status(201).json(createSuccessResponse(role, 'Role created successfully'));
  });

  // Update a role
  updateRole = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw AuthError.tenantNotFound();

    const data = validateUpdateRole(req.body);
    const role = await rbacService.updateRole(req.params.id!, tenantId, data);
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

  // Get the permission catalogue
  getPermissions = asyncHandler(async (_req: Request, res: Response) => {
    const permissions = rbacService.getPermissionCatalogue();
    res.json(createSuccessResponse(permissions, 'Permissions retrieved successfully'));
  });

  // Get reference role templates
  getReferenceRoles = asyncHandler(async (_req: Request, res: Response) => {
    const referenceRoles = rbacService.getReferenceRoles();
    res.json(createSuccessResponse(referenceRoles, 'Reference roles retrieved successfully'));
  });
}

export const rbacController = new RbacController();
