import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingBudgetController as controller } from './training-budget.controller';

const router = Router();

// Utilization must come before :id to avoid "utilization" being captured as an ID
router.get('/utilization', requirePermissions(['hr:read']), controller.getUtilization);

router.get('/', requirePermissions(['hr:read']), controller.listBudgets);
router.post('/', requirePermissions(['hr:create']), controller.createBudget);
router.patch('/:id', requirePermissions(['hr:update']), controller.updateBudget);

export { router as trainingBudgetRoutes };
