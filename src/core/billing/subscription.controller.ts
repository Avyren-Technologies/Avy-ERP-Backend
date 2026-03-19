import { Request, Response } from 'express';
import { subscriptionService } from './subscription.service';
import { createSuccessResponse } from '../../shared/utils';
import { asyncHandler } from '../../middleware/error.middleware';

export class SubscriptionController {
  // ── Get subscription detail ────────────────────────────────────────
  getDetail = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.params.companyId!;
    const detail = await subscriptionService.getSubscriptionDetail(companyId);
    res.json(createSuccessResponse(detail, 'Subscription detail retrieved successfully'));
  });

  // ── Get cost preview ───────────────────────────────────────────────
  getCostPreview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.params.companyId!;
    const billingType = req.query.billingType as string;
    const locationId = req.query.locationId as string | undefined;

    const preview = await subscriptionService.getCostPreview(companyId, billingType, locationId);
    res.json(createSuccessResponse(preview, 'Cost preview calculated successfully'));
  });

  // ── Change billing type ────────────────────────────────────────────
  changeBillingType = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.params.companyId!;
    const result = await subscriptionService.changeBillingType(companyId, req.body);
    res.json(createSuccessResponse(result, 'Billing type updated successfully'));
  });

  // ── Change tier ────────────────────────────────────────────────────
  changeTier = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.params.companyId!;
    const result = await subscriptionService.changeTier(companyId, req.body);
    res.json(createSuccessResponse(result, 'Tier updated successfully'));
  });

  // ── Extend trial ──────────────────────────────────────────────────
  extendTrial = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.params.companyId!;
    const result = await subscriptionService.extendTrial(companyId, req.body);
    res.json(createSuccessResponse(result, 'Trial extended successfully'));
  });

  // ── Cancel subscription ───────────────────────────────────────────
  cancel = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.params.companyId!;
    const result = await subscriptionService.cancelSubscription(companyId);
    res.json(createSuccessResponse(result, 'Subscription cancelled successfully'));
  });

  // ── Reactivate subscription ───────────────────────────────────────
  reactivate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.params.companyId!;
    const result = await subscriptionService.reactivateSubscription(companyId);
    res.json(createSuccessResponse(result, 'Subscription reactivated successfully'));
  });
}

export const subscriptionController = new SubscriptionController();
