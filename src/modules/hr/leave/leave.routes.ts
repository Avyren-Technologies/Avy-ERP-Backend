import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { requireModuleEnabled, requireESSFeature, requireESSFeatureUnlessAdmin } from '../../../shared/middleware/config-enforcement.middleware';
import { leaveController as controller } from './leave.controller';
import { leaveBalanceBulkImportController as bulkController, bulkBalanceUploadMiddleware } from './bulk-import.controller';

const router = Router();

// ── Module Enforcement ──────────────────────────────────────────────
router.use(requireModuleEnabled('leave'));

// ── Leave Types ─────────────────────────────────────────────────────
router.get('/leave-types', requirePermissions(['hr:read', 'ess:view-leave']), controller.listLeaveTypes);
router.post('/leave-types', requirePermissions(['hr:create']), controller.createLeaveType);
router.get('/leave-types/:id', requirePermissions(['hr:read']), controller.getLeaveType);
router.patch('/leave-types/:id', requirePermissions(['hr:update']), controller.updateLeaveType);
router.delete('/leave-types/:id', requirePermissions(['hr:delete']), controller.deleteLeaveType);

// ── Leave Policies ──────────────────────────────────────────────────
router.get('/leave-policies', requirePermissions(['hr:read']), controller.listPolicies);
router.post('/leave-policies', requirePermissions(['hr:create']), controller.createPolicy);
router.patch('/leave-policies/:id', requirePermissions(['hr:update']), controller.updatePolicy);
router.delete('/leave-policies/:id', requirePermissions(['hr:delete']), controller.deletePolicy);

// ── Leave Balances ──────────────────────────────────────────────────
router.get('/leave-balances', requirePermissions(['hr:read', 'ess:view-leave']), controller.listBalances);
router.post('/leave-balances/adjust', requirePermissions(['hr:update']), controller.adjustBalance);
router.post('/leave-balances/initialize', requirePermissions(['hr:create']), controller.initializeBalances);
router.post('/leave-balances/accrue', requirePermissions(['hr:update']), controller.accrueBalances);
router.post('/leave-balances/carry-forward', requirePermissions(['hr:update']), controller.carryForwardBalances);
router.post('/leave-balances/encash', requirePermissions(['hr:update']), controller.encashBalance);

// ── Leave Balance Bulk Import — MUST be before /:id routes ─────────
router.get('/leave-balances/bulk/template', requirePermissions(['hr:create']), bulkController.downloadTemplate);
router.post('/leave-balances/bulk/validate', requirePermissions(['hr:create']), bulkBalanceUploadMiddleware, bulkController.validateUpload);
router.post('/leave-balances/bulk/import', requirePermissions(['hr:create']), bulkController.confirmImport);

router.patch('/leave-balances/:id', requirePermissions(['hr:update']), controller.updateBalance);
router.get('/leave-balances/:id/transactions', requirePermissions(['hr:read']), controller.listTransactions);

// ── Leave Requests ──────────────────────────────────────────────────
router.get('/leave-requests', requirePermissions(['hr:read', 'ess:apply-leave']), controller.listRequests);
router.post('/leave-requests', requirePermissions(['hr:create', 'ess:apply-leave']), controller.createRequest);
router.get('/leave-requests/:id', requirePermissions(['hr:read', 'ess:apply-leave']), controller.getRequest);
router.patch('/leave-requests/:id/approve', requirePermissions(['hr:update']), controller.approveRequest);
router.patch('/leave-requests/:id/reject', requirePermissions(['hr:update']), controller.rejectRequest);
router.patch('/leave-requests/:id/cancel', requirePermissions(['hr:update', 'ess:apply-leave']), requireESSFeatureUnlessAdmin('leaveCancellation'), controller.cancelRequest);
router.patch('/leave-requests/:id/partial-cancel', requirePermissions(['hr:update']), controller.partialCancelRequest);

// ── Summary ─────────────────────────────────────────────────────────
router.get('/leave/summary', requirePermissions(['hr:read', 'ess:view-leave']), controller.getLeaveSummary);

export { router as leaveRoutes };
