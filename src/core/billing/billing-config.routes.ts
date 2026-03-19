import { Router } from 'express';
import { billingConfigController } from './billing-config.controller';

const router = Router();

// Billing config defaults — mounted under /platform/billing/config
router.get('/defaults', billingConfigController.getDefaults);
router.patch('/defaults', billingConfigController.updateDefaults);

export { router as billingConfigRoutes };
