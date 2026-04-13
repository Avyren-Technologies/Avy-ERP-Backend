import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { reportsController } from './reports.controller';

const router = Router();

router.get('/daily-log', requirePermissions(['visitors:export']), reportsController.getDailyLog);
router.get('/summary', requirePermissions(['visitors:export']), reportsController.getSummary);
router.get('/overstay', requirePermissions(['visitors:export']), reportsController.getOverstay);
router.get('/analytics', requirePermissions(['visitors:read']), reportsController.getAnalytics);

export { router as reportsRoutes };
