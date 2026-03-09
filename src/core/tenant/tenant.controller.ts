import { Request, Response } from 'express';
import { tenantService } from './tenant.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { RequestWithUser } from '../../shared/types';

export class TenantController {
  // Create tenant
  createTenant = asyncHandler(async (req: Request, res: Response) => {
    const tenantData = req.body;
    const tenant = await tenantService.createTenant(tenantData);

    res.status(201).json(createSuccessResponse(tenant, 'Tenant created successfully'));
  });

  // Get tenant by ID
  getTenant = asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    const tenant = await tenantService.getTenantById(tenantId);

    res.json(createSuccessResponse(tenant));
  });

  // Get tenant by company ID
  getTenantByCompany = asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) {
      throw new Error('Company ID is required');
    }
    const tenant = await tenantService.getTenantByCompanyId(companyId);

    res.json(createSuccessResponse(tenant));
  });

  // Update tenant
  updateTenant = asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    const updateData = req.body;
    const tenant = await tenantService.updateTenant(tenantId, updateData);

    res.json(createSuccessResponse(tenant, 'Tenant updated successfully'));
  });

  // Delete tenant
  deleteTenant = asyncHandler(async (req: Request, res: Response) => {
    const { tenantId } = req.params;
    if (!tenantId) {
      throw new Error('Tenant ID is required');
    }
    const result = await tenantService.deleteTenant(tenantId);

    res.json(createSuccessResponse(result));
  });

  // List tenants
  listTenants = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = getPaginationParams(req.query);
    const { status, search } = req.query;

    const result = await tenantService.listTenants({
      page,
      limit,
      status: status as any,
      search: search as string,
    });

    res.json(createPaginatedResponse(
      result.tenants,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total,
      'Tenants retrieved successfully'
    ));
  });

  // Get tenant statistics
  getTenantStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await tenantService.getTenantStats();

    res.json(createSuccessResponse(stats, 'Tenant statistics retrieved successfully'));
  });
}

export const tenantController = new TenantController();