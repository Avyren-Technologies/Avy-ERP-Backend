import { Request, Response } from 'express';
import { materialPassService } from './material-pass.service';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createMaterialPassSchema,
  materialReturnSchema,
  materialPassListQuerySchema,
} from './material-pass.validators';

class MaterialPassController {

  list = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = materialPassListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { data, total } = await materialPassService.list(companyId, parsed.data);
    res.json(createPaginatedResponse(data, parsed.data.page, parsed.data.limit, total, 'Material passes retrieved'));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createMaterialPassSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const pass = await materialPassService.create(companyId, parsed.data, req.user!.id);
    res.status(201).json(createSuccessResponse(pass, 'Material pass created'));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const pass = await materialPassService.getById(companyId, req.params.id!);
    res.json(createSuccessResponse(pass, 'Material pass retrieved'));
  });

  markReturned = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = materialReturnSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const pass = await materialPassService.markReturned(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(pass, 'Material return recorded'));
  });
}

export const materialPassController = new MaterialPassController();
