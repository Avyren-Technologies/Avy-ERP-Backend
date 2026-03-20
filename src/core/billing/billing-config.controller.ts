import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { createSuccessResponse } from '../../shared/utils';
import { ApiError } from '../../shared/errors';
import { billingConfigService } from './billing-config.service';
import { updateBillingConfigSchema } from './billing.validators';

export class BillingConfigController {
  getDefaults = asyncHandler(async (req: Request, res: Response) => {
    const config = await billingConfigService.getConfig();
    res.json(createSuccessResponse(config, 'Billing config retrieved'));
  });

  updateDefaults = asyncHandler(async (req: Request, res: Response) => {
    const parsed = updateBillingConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const config = await billingConfigService.updateConfig(parsed.data as any);
    res.json(createSuccessResponse(config, 'Billing config updated'));
  });
}

export const billingConfigController = new BillingConfigController();
