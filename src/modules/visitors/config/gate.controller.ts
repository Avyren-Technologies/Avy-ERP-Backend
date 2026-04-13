import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { gateService } from './gate.service';
import {
  createGateSchema,
  updateGateSchema,
  gateListQuerySchema,
} from './gate.validators';

class GateController {
  list = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = gateListQuerySchema.safeParse(req.query);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const { data, total } = await gateService.list(companyId, parsed.data);
    res.json(createPaginatedResponse(data, parsed.data.page, parsed.data.limit, total, 'Gates retrieved'));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await gateService.getById(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Gate retrieved'));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createGateSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const result = await gateService.create(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(result, 'Gate created'));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateGateSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));

    const result = await gateService.update(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(result, 'Gate updated'));
  });

  deactivate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await gateService.deactivate(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Gate deactivated'));
  });
}

export const gateController = new GateController();
