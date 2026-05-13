import { Router, Request, Response, NextFunction } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { getCachedSystemControls } from '../../../shared/utils/config-cache';
import { pipController } from './pip.controller';

const router = Router();
const controller = pipController;

// Gate: check if PIP is enabled for this company
router.use(asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const companyId = req.user?.companyId;
  if (!companyId) throw ApiError.unauthorized('Authentication required');
  const controls = await getCachedSystemControls(companyId);
  if (!controls.productionIncentivePlanEnabled) {
    throw ApiError.forbidden('Production Incentive Plan is not enabled for this company');
  }
  next();
}));

// ── Config ──────────────────────────────────────────────────────────
router.get('/config', requirePermissions(['production.pip:read']), controller.getIncentiveConfig);
router.patch('/config', requirePermissions(['production.pip:configure']), controller.updateIncentiveConfig);

// ── Slab Configs (bulk before :id) ──────────────────────────────────
router.post('/slab-configs/bulk', requirePermissions(['production.pip:create']), controller.bulkCreateSlabConfigs);
router.get('/slab-configs', requirePermissions(['production.pip:read']), controller.listSlabConfigs);
router.post('/slab-configs', requirePermissions(['production.pip:create']), controller.createSlabConfig);
router.get('/slab-configs/:id', requirePermissions(['production.pip:read']), controller.getSlabConfig);
router.patch('/slab-configs/:id', requirePermissions(['production.pip:update']), controller.updateSlabConfig);
router.delete('/slab-configs/:id', requirePermissions(['production.pip:delete']), controller.deleteSlabConfig);

// ── Daily Entries (summary before :id-like routes) ──────────────────
router.get('/daily-entries/summary', requirePermissions(['production.pip:read']), controller.getDailyEntrySummary);
router.post('/daily-entries', requirePermissions(['production.pip:create']), controller.saveDailyEntries);
router.get('/daily-entries', requirePermissions(['production.pip:read']), controller.listDailyEntries);
router.delete('/daily-entries/:sessionRef', requirePermissions(['production.pip:delete']), controller.deleteDailyEntries);

// ── Calculator ──────────────────────────────────────────────────────
router.post('/calculate', requirePermissions(['production.pip:read']), controller.simulateIncentive);

// ── Dashboard ───────────────────────────────────────────────────────
router.get('/dashboard', requirePermissions(['production.pip:read']), controller.getDashboardMetrics);

// ── Monthly Reports (generate before :id) ───────────────────────────
router.post('/monthly-reports/generate', requirePermissions(['production.pip:create']), controller.generateMonthlyReport);
router.get('/monthly-reports', requirePermissions(['production.pip:read']), controller.listMonthlyReports);
router.get('/monthly-reports/:id', requirePermissions(['production.pip:read']), controller.getMonthlyReport);
router.post('/monthly-reports/:id/submit', requirePermissions(['production.pip:approve']), controller.submitMonthlyReport);
router.patch('/monthly-reports/:id/approve', requirePermissions(['production.pip:approve']), controller.approveMonthlyReport);
router.patch('/monthly-reports/:id/reject', requirePermissions(['production.pip:approve']), controller.rejectMonthlyReport);
router.post('/monthly-reports/:id/merge', requirePermissions(['production.pip:approve']), controller.mergeToPayroll);
router.get('/monthly-reports/:id/merge-preview', requirePermissions(['production.pip:read']), controller.previewPayrollMerge);
router.post('/monthly-reports/:id/reverse', requirePermissions(['production.pip:configure']), controller.reversePayrollMerge);

// ── Export ─────────────────────────────────────────────────────────
router.get('/export/daily-report', requirePermissions(['production.pip:read']), controller.exportDailyReport);
router.get('/export/monthly-report', requirePermissions(['production.pip:read']), controller.exportMonthlyReport);

export { router as pipRoutes };
