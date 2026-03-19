import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/error.middleware';
import { createSuccessResponse } from '../../shared/utils';
import { billingConfigService } from './billing-config.service';

export class BillingConfigController {
  getDefaults = asyncHandler(async (req: Request, res: Response) => {
    const config = await billingConfigService.getConfig();
    res.json(createSuccessResponse(config, 'Billing config retrieved'));
  });

  updateDefaults = asyncHandler(async (req: Request, res: Response) => {
    const config = await billingConfigService.updateConfig(req.body);
    res.json(createSuccessResponse(config, 'Billing config updated'));
  });
}

export const billingConfigController = new BillingConfigController();
