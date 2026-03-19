import { Request, Response } from 'express';
import { companyService } from './company.service';
import { tenantService } from '../tenant/tenant.service';
import { updateSectionSchemas, updateCompanyStatusSchema } from '../tenant/tenant.validators';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import type { CompanySectionKey } from '../tenant/tenant.types';

export class CompanyController {
  // ── List companies (paginated) ───────────────────────────────────────
  listCompanies = asyncHandler(async (req: Request, res: Response) => {
    const { page, limit } = getPaginationParams(req.query);
    const { status, search, sortBy } = req.query;

    const result = await companyService.listCompanies({
      page,
      limit,
      status: status as string,
      search: search as string,
      sortBy: sortBy as string,
    });

    res.json(createPaginatedResponse(
      result.companies,
      result.pagination.page,
      result.pagination.limit,
      result.pagination.total,
      'Companies retrieved successfully',
    ));
  });

  // ── Get full company detail ──────────────────────────────────────────
  getCompany = asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) {
      throw ApiError.badRequest('Company ID is required');
    }

    const company = await companyService.getCompanyById(companyId);
    res.json(createSuccessResponse(company, 'Company retrieved successfully'));
  });

  // ── Section-based partial update (validates THEN delegates) ─────────
  updateCompanySection = asyncHandler(async (req: Request, res: Response) => {
    const { companyId, sectionKey } = req.params;
    if (!companyId || !sectionKey) {
      throw ApiError.badRequest('Company ID and section key are required');
    }

    // Validate payload against the section's Zod schema BEFORE any DB writes
    const schema = updateSectionSchemas[sectionKey];
    if (!schema) {
      throw ApiError.badRequest(`Unknown section key: ${sectionKey}`);
    }
    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      const errors = parseResult.error.flatten().fieldErrors;
      throw ApiError.badRequest(`Validation failed for section "${sectionKey}": ${JSON.stringify(errors)}`);
    }

    const result = await tenantService.updateCompanySection(
      companyId,
      sectionKey as CompanySectionKey,
      parseResult.data, // use validated data, not raw req.body
    );
    res.json(createSuccessResponse(result, 'Section updated successfully'));
  });

  // ── Update company status (validates against allowed values) ─────────
  updateCompanyStatus = asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) {
      throw ApiError.badRequest('Company ID is required');
    }

    const parseResult = updateCompanyStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw ApiError.badRequest('Status must be one of: Draft, Pilot, Active, Inactive');
    }

    const result = await tenantService.updateCompanyStatus(companyId, parseResult.data.status);
    res.json(createSuccessResponse(result, 'Status updated'));
  });

  // ── Delete company ───────────────────────────────────────────────────
  deleteCompany = asyncHandler(async (req: Request, res: Response) => {
    const { companyId } = req.params;
    if (!companyId) {
      throw ApiError.badRequest('Company ID is required');
    }

    const result = await tenantService.deleteCompany(companyId);
    res.json(createSuccessResponse(result));
  });
}

export const companyController = new CompanyController();
