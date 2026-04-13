import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { visitorTypeService } from './visitor-type.service';
import {
  createVisitorTypeSchema,
  updateVisitorTypeSchema,
  visitorTypeListQuerySchema,
} from './visitor-type.validators';

class VisitorTypeController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = visitorTypeListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const { data, total } = await visitorTypeService.list(companyId, parsed.data);
    res.json(createPaginatedResponse(data, parsed.data.page, parsed.data.limit, total, 'Visitor types retrieved'));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await visitorTypeService.getById(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Visitor type retrieved'));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createVisitorTypeSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const result = await visitorTypeService.create(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(result, 'Visitor type created'));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateVisitorTypeSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const result = await visitorTypeService.update(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(result, 'Visitor type updated'));
  });

  deactivate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await visitorTypeService.deactivate(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Visitor type deactivated'));
  });
}

export const visitorTypeController = new VisitorTypeController();
