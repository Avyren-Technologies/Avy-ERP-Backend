import { Request, Response } from 'express';
import { trainingMaterialService } from './training-material.service';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createMaterialSchema, updateMaterialSchema } from './training-material.validators';

export class TrainingMaterialController {
  listMaterials = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const records = await trainingMaterialService.listMaterials(companyId, req.params.trainingId!);
    res.json(createSuccessResponse(records, 'Training materials retrieved'));
  });

  createMaterial = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createMaterialSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));

    const record = await trainingMaterialService.createMaterial(companyId, req.params.trainingId!, parsed.data);
    res.status(201).json(createSuccessResponse(record, 'Training material created'));
  });

  updateMaterial = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateMaterialSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));

    const record = await trainingMaterialService.updateMaterial(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(record, 'Training material updated'));
  });

  deleteMaterial = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await trainingMaterialService.deleteMaterial(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Training material deleted'));
  });
}

export const trainingMaterialController = new TrainingMaterialController();
