import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { reportsController } from './reports.controller';

const router = Router();

router.get('/daily-log', requirePermissions(['visitors.reports:export']), reportsController.getDailyLog);
router.get('/summary', requirePermissions(['visitors.reports:export']), reportsController.getSummary);
router.get('/overstay', requirePermissions(['visitors.reports:export']), reportsController.getOverstay);
router.get('/analytics', requirePermissions(['visitors.reports:read']), reportsController.getAnalytics);

export { router as reportsRoutes };
