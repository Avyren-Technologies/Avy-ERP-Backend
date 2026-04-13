import { Request, Response } from 'express';
import { vehiclePassService } from './vehicle-pass.service';
import { createSuccessResponse, createPaginatedResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createVehiclePassSchema,
  vehicleExitSchema,
  vehiclePassListQuerySchema,
} from './vehicle-pass.validators';

class VehiclePassController {

  list = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = vehiclePassListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { data, total } = await vehiclePassService.list(companyId, parsed.data);
    res.json(createPaginatedResponse(data, parsed.data.page, parsed.data.limit, total, 'Vehicle passes retrieved'));
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createVehiclePassSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const pass = await vehiclePassService.create(companyId, parsed.data, req.user!.id);
    res.status(201).json(createSuccessResponse(pass, 'Vehicle pass created'));
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const pass = await vehiclePassService.getById(companyId, req.params.id!);
    res.json(createSuccessResponse(pass, 'Vehicle pass retrieved'));
  });

  recordExit = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = vehicleExitSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const pass = await vehiclePassService.recordExit(companyId, req.params.id!, parsed.data.exitGateId);
    res.json(createSuccessResponse(pass, 'Vehicle exit recorded'));
  });
}

export const vehiclePassController = new VehiclePassController();
