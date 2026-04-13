import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse } from '../../../shared/utils';
import { vmsConfigService } from './vms-config.service';
import { updateVmsConfigSchema } from './vms-config.validators';

// Fields that should never be sent to the update — strip them from the payload
const READONLY_FIELDS = ['id', 'companyId', 'createdAt', 'updatedAt'];

class VmsConfigController {
  get = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await vmsConfigService.get(companyId);
    res.json(createSuccessResponse(config, 'VMS configuration retrieved'));
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    // Strip readonly and unknown fields before validation
    const body = { ...req.body };
    for (const key of READONLY_FIELDS) {
      delete body[key];
    }
    // Strip any fields not in the schema (frontend may send extra UI-only fields)
    const schemaKeys = Object.keys(updateVmsConfigSchema.shape);
    for (const key of Object.keys(body)) {
      if (!schemaKeys.includes(key)) {
        delete body[key];
      }
    }

    const parsed = updateVmsConfigSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    }

    const config = await vmsConfigService.update(companyId, parsed.data);
    res.json(createSuccessResponse(config, 'VMS configuration updated'));
  });
}

export const vmsConfigController = new VmsConfigController();
