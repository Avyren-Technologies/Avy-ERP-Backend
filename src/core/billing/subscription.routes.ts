import { Router } from 'express';
import { subscriptionController } from './subscription.controller';

const router = Router();

// All subscription routes are mounted under /platform/billing/subscriptions
// which already has platform:admin permission from the main router

router.get('/:companyId', subscriptionController.getDetail);
router.get('/:companyId/cost-preview', subscriptionController.getCostPreview);
router.patch('/:companyId/billing-type', subscriptionController.changeBillingType);
router.patch('/:companyId/tier', subscriptionController.changeTier);
router.patch('/:companyId/trial', subscriptionController.extendTrial);
router.post('/:companyId/cancel', subscriptionController.cancel);
router.post('/:companyId/reactivate', subscriptionController.reactivate);

export { router as subscriptionRoutes };
