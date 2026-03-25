import { Request, Response } from 'express';
import { featureToggleService } from './feature-toggle.service';
import { createSuccessResponse } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';
import { AuthError } from '../../shared/errors';
import { getFeatureToggleCatalogue } from '../../shared/constants/feature-toggles';

export class FeatureToggleController {
  // Get the feature toggle catalogue
  getCatalogue = asyncHandler(async (_req: Request, res: Response) => {
    const catalogue = getFeatureToggleCatalogue();
    res.json(createSuccessResponse(catalogue, 'Feature toggle catalogue retrieved'));
  });

  // Get toggles for a user
  getToggles = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw AuthError.tenantNotFound();

    const userId = req.query.userId as string || req.user!.id;
    const toggles = await featureToggleService.getUserToggles(tenantId, userId);
    res.json(createSuccessResponse(toggles));
  });

  // Set toggles for a user
  setToggles = asyncHandler(async (req: Request, res: Response) => {
    const tenantId = req.user?.tenantId;
    if (!tenantId) throw AuthError.tenantNotFound();

    const { userId } = req.params;
    const { toggles } = req.body;
    const result = await featureToggleService.setUserToggles(tenantId, userId!, toggles);
    res.json(createSuccessResponse(result, 'Feature toggles updated successfully'));
  });
}

export const featureToggleController = new FeatureToggleController();
