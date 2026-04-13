import { Request, Response } from 'express';
import { emergencyService } from './emergency.service';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';

class EmergencyController {

  trigger = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { plantId, isDrill } = req.body;
    if (!plantId) throw ApiError.badRequest('Plant ID is required');

    const result = await emergencyService.triggerEmergency(companyId, plantId, req.user!.id, isDrill ?? false);
    res.json(createSuccessResponse(result, 'Emergency triggered'));
  });

  getMusterList = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const plantId = req.query.plantId as string | undefined;
    const musterList = await emergencyService.getMusterList(companyId, plantId);
    res.json(createSuccessResponse(musterList, 'Muster list retrieved'));
  });

  markSafe = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { visitIds } = req.body;
    if (!visitIds || !Array.isArray(visitIds) || visitIds.length === 0) {
      throw ApiError.badRequest('Visit IDs array is required');
    }

    const result = await emergencyService.markSafe(companyId, visitIds, req.user!.id);
    res.json(createSuccessResponse(result, 'Visitors marked as safe'));
  });

  resolve = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { plantId } = req.body;
    if (!plantId) throw ApiError.badRequest('Plant ID is required');

    const result = await emergencyService.resolveEmergency(companyId, plantId, req.user!.id);
    res.json(createSuccessResponse(result, 'Emergency resolved'));
  });
}

export const emergencyController = new EmergencyController();
