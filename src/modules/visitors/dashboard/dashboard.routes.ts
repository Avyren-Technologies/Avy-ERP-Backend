import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { dashboardController } from './dashboard.controller';

const router = Router();

router.get('/today', requirePermissions(['visitors:read']), dashboardController.getTodayDashboard);
router.get('/on-site', requirePermissions(['visitors:read']), dashboardController.getOnSite);
router.get('/stats', requirePermissions(['visitors:read']), dashboardController.getStats);

export { router as dashboardRoutes };
