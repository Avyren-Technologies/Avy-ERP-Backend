import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { ApiError } from '../../shared/errors';
import { createSuccessResponse } from '../../shared/utils';
import { geofenceService } from './geofence.service';
import { createGeofenceSchema, updateGeofenceSchema } from './geofence.validators';

class GeofenceController {
  listGeofences = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const result = await geofenceService.listGeofences(companyId, req.params.locationId!);
    res.json(createSuccessResponse(result, 'Geofences retrieved'));
  });

  createGeofence = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const parsed = createGeofenceSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await geofenceService.createGeofence(companyId, req.params.locationId!, parsed.data);
    res.status(201).json(createSuccessResponse(result, 'Geofence created'));
  });

  updateGeofence = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const parsed = updateGeofenceSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    const result = await geofenceService.updateGeofence(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(result, 'Geofence updated'));
  });

  deleteGeofence = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const result = await geofenceService.deleteGeofence(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Geofence deleted'));
  });

  setDefault = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const result = await geofenceService.setDefault(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Default geofence updated'));
  });

  listForDropdown = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');
    const locationId = req.query.locationId as string;
    if (!locationId) throw ApiError.badRequest('locationId query parameter is required');
    const result = await geofenceService.listForDropdown(companyId, locationId);
    res.json(createSuccessResponse(result, 'Geofences for dropdown retrieved'));
  });
}

export const geofenceController = new GeofenceController();
