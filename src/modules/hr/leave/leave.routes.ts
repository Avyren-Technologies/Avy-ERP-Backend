import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { leaveController as controller } from './leave.controller';

const router = Router();

// ── Leave Types ─────────────────────────────────────────────────────
router.get('/leave-types', requirePermissions(['hr:read']), controller.listLeaveTypes);
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
router.get('/leave-balances', requirePermissions(['hr:read']), controller.listBalances);
router.post('/leave-balances/adjust', requirePermissions(['hr:update']), controller.adjustBalance);
router.post('/leave-balances/initialize', requirePermissions(['hr:create']), controller.initializeBalances);

// ── Leave Requests ──────────────────────────────────────────────────
router.get('/leave-requests', requirePermissions(['hr:read']), controller.listRequests);
router.post('/leave-requests', requirePermissions(['hr:create']), controller.createRequest);
router.get('/leave-requests/:id', requirePermissions(['hr:read']), controller.getRequest);
router.patch('/leave-requests/:id/approve', requirePermissions(['hr:update']), controller.approveRequest);
router.patch('/leave-requests/:id/reject', requirePermissions(['hr:update']), controller.rejectRequest);
router.patch('/leave-requests/:id/cancel', requirePermissions(['hr:update']), controller.cancelRequest);

// ── Summary ─────────────────────────────────────────────────────────
router.get('/leave/summary', requirePermissions(['hr:read']), controller.getLeaveSummary);

export { router as leaveRoutes };
