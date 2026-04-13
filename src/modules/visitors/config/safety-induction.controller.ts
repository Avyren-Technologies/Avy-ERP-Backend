import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { safetyInductionService } from './safety-induction.service';
import {
  createSafetyInductionSchema,
  updateSafetyInductionSchema,
  safetyInductionListQuerySchema,
} from './safety-induction.validators';

class SafetyInductionController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = safetyInductionListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const { data, total } = await safetyInductionService.list(companyId, parsed.data);
    res.json(createPaginatedResponse(data, parsed.data.page, parsed.data.limit, total, 'Safety inductions retrieved'));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await safetyInductionService.getById(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Safety induction retrieved'));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSafetyInductionSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const result = await safetyInductionService.create(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(result, 'Safety induction created'));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSafetyInductionSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const result = await safetyInductionService.update(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(result, 'Safety induction updated'));
  });

  deactivate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await safetyInductionService.deactivate(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Safety induction deactivated'));
  });
}

export const safetyInductionController = new SafetyInductionController();
