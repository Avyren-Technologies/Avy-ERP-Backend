import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { tenantService } from './tenant.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import { RequestWithUser } from '../../shared/types';
import { onboardTenantSchema, updateSectionSchemas, updateCompanyStatusSchema } from './tenant.validators';
import type { CompanySectionKey, OnboardTenantPayload } from './tenant.types';

export class TenantController {
  // ── Onboarding (full wizard) ────────────────────────────────────────
  onboardTenant = asyncHandler(async (req: Request, res: Response) => {
    const parsed = onboardTenantSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(formatZodError(parsed.error), 'VALIDATION_ERROR');
    }

    const result = await tenantService.onboardTenant(parsed.data as OnboardTenantPayload);
    res.status(201).json(createSuccessResponse(result, 'Tenant onboarded successfully'));
  });

  // ── Full company detail ─────────────────────────────────────────────
  getFullCompanyDetail = asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) {
      throw ApiError.badRequest('Company ID is required');
    }

    const detail = await tenantService.getFullCompanyDetail(companyId);
    res.json(createSuccessResponse(detail));
  });

  // ── Section-based partial update ────────────────────────────────────
  updateCompanySection = asyncHandler(async (req: Request, res: Response) => {
    const { companyId, sectionKey } = req.params;
    if (!companyId || !sectionKey) {
      throw ApiError.badRequest('Company ID and section key are required');
    }

    const schema = updateSectionSchemas[sectionKey];
    if (!schema) {
      throw ApiError.badRequest(`Unknown section key: ${sectionKey}`);
    }

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(formatZodError(parsed.error as ZodError), 'VALIDATION_ERROR');
    }

    const result = await tenantService.updateCompanySection(
      companyId,
      sectionKey as CompanySectionKey,
      parsed.data,
    );
    res.json(createSuccessResponse(result, 'Section updated successfully'));
  });

  // ── Update company status ───────────────────────────────────────────
  updateCompanyStatus = asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) {
      throw ApiError.badRequest('Company ID is required');
    }

    const parsed = updateCompanyStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(formatZodError(parsed.error), 'VALIDATION_ERROR');
    }

    const result = await tenantService.updateCompanyStatus(companyId, parsed.data.status);
    res.json(createSuccessResponse(result, 'Status updated'));
  });

  // ── Delete company ──────────────────────────────────────────────────
  deleteCompany = asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) {
      throw ApiError.badRequest('Company ID is required');
    }

    const result = await tenantService.deleteCompany(companyId);
    res.json(createSuccessResponse(result));
  });

  // ════════════════════════════════════════════════════════════════════
  // Existing handlers (unchanged)
  // ════════════════════════════════════════════════════════════════════

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

// ── Helpers ──────────────────────────────────────────────────────────

/** Flatten a ZodError into a readable string for API responses. */
function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') + ': ' : '';
      return `${path}${issue.message}`;
    })
    .join('; ');
}

export const tenantController = new TenantController();
