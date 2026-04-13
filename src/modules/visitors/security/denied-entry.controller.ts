import { Request, Response } from 'express';
import { deniedEntryService } from './denied-entry.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';

export class DeniedEntryController {
  // ────────────────────────────────────────────────────────────────────
  // List denied entries
  // ────────────────────────────────────────────────────────────────────

  list = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const filters: {
      denialReason?: string;
      fromDate?: string;
      toDate?: string;
      gateId?: string;
      search?: string;
      page: number;
      limit: number;
    } = { page, limit };

    if (req.query.denialReason) filters.denialReason = req.query.denialReason as string;
    if (req.query.fromDate) filters.fromDate = req.query.fromDate as string;
    if (req.query.toDate) filters.toDate = req.query.toDate as string;
    if (req.query.gateId) filters.gateId = req.query.gateId as string;
    if (req.query.search) filters.search = req.query.search as string;

    const result = await deniedEntryService.list(companyId, filters);
    res.json(
      createPaginatedResponse(result.data, result.page, result.limit, result.total, 'Denied entries retrieved'),
    );
  });

  // ────────────────────────────────────────────────────────────────────
  // Get denied entry detail
  // ────────────────────────────────────────────────────────────────────

  getById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const entry = await deniedEntryService.getById(companyId, req.params.id!);
    res.json(createSuccessResponse(entry, 'Denied entry retrieved'));
  });
}

export const deniedEntryController = new DeniedEntryController();
