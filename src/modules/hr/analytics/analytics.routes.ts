import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { analyticsController as controller } from './analytics.controller';

const router = Router();

// ── Dashboard & Drilldown ────────────────────────────────────────────
router.get('/analytics/dashboard/:dashboard', requirePermissions(['analytics:read']), controller.getDashboard);
router.get('/analytics/drilldown/:dashboard', requirePermissions(['analytics:read']), controller.getDrilldown);

// ── Reports Hub ───────────────────────────────────────────────────────
router.get('/analytics/reports/catalog', requirePermissions(['analytics:read']), controller.getReportCatalog);
router.get('/analytics/reports/history', requirePermissions(['analytics:read']), controller.getReportHistory);
router.get('/analytics/reports/rate-limit', requirePermissions(['analytics:read']), controller.getRateLimit);

// ── Export ────────────────────────────────────────────────────────────
router.get('/analytics/export/:reportType', requirePermissions(['analytics:export']), controller.exportReport);

// ── Alerts ───────────────────────────────────────────────────────────
router.get('/analytics/alerts', requirePermissions(['analytics:read']), controller.getAlerts);
router.post('/analytics/alerts/:id/acknowledge', requirePermissions(['analytics:read']), controller.acknowledgeAlert);
router.post('/analytics/alerts/:id/resolve', requirePermissions(['analytics:read']), controller.resolveAlert);

// ── Admin ────────────────────────────────────────────────────────────
router.post('/analytics/recompute', requirePermissions(['analytics:export']), controller.recompute);

export { router as analyticsRoutes };
