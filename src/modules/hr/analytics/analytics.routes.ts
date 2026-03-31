import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { analyticsController as controller } from './analytics.controller';

const router = Router();

// ── Dashboard & Drilldown ────────────────────────────────────────────
router.get('/analytics/dashboard/:dashboard', requirePermissions(['hr:read']), controller.getDashboard);
router.get('/analytics/drilldown/:dashboard', requirePermissions(['hr:read']), controller.getDrilldown);

// ── Export ────────────────────────────────────────────────────────────
router.get('/analytics/export/:reportType', requirePermissions(['hr:export']), controller.exportReport);

// ── Alerts ───────────────────────────────────────────────────────────
router.get('/analytics/alerts', requirePermissions(['hr:read']), controller.getAlerts);
router.post('/analytics/alerts/:id/acknowledge', requirePermissions(['hr:read']), controller.acknowledgeAlert);
router.post('/analytics/alerts/:id/resolve', requirePermissions(['hr:read']), controller.resolveAlert);

// ── Admin ────────────────────────────────────────────────────────────
router.post('/analytics/recompute', requirePermissions(['hr:configure']), controller.recompute);

export { router as analyticsRoutes };
