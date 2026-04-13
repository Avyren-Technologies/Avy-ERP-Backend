import { Request, Response } from 'express';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createSuccessResponse } from '../../../shared/utils';
import { vmsConfigService } from './vms-config.service';
import { updateVmsConfigSchema } from './vms-config.validators';

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

    const parsed = updateVmsConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map(e => e.message).join(', '));
    }

    const config = await vmsConfigService.update(companyId, parsed.data);
    res.json(createSuccessResponse(config, 'VMS configuration updated'));
  });
}

export const vmsConfigController = new VmsConfigController();
