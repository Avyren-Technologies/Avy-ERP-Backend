import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { offboardingController as controller } from './offboarding.controller';

const router = Router();

// ── Exit Requests ─────────────────────────────────────────────────
router.get('/exit-requests', requirePermissions(['hr:read']), controller.listExitRequests);
router.post('/exit-requests', requirePermissions(['hr:create']), controller.createExitRequest);
router.get('/exit-requests/:id', requirePermissions(['hr:read']), controller.getExitRequest);
router.patch('/exit-requests/:id', requirePermissions(['hr:update']), controller.updateExitRequest);

// ── Clearances ────────────────────────────────────────────────────
router.get('/exit-requests/:id/clearances', requirePermissions(['hr:read']), controller.listClearances);
router.patch('/exit-clearances/:id', requirePermissions(['hr:update']), controller.updateClearance);

// ── Exit Interview ────────────────────────────────────────────────
router.post('/exit-requests/:id/interview', requirePermissions(['hr:create']), controller.createExitInterview);
router.get('/exit-requests/:id/interview', requirePermissions(['hr:read']), controller.getExitInterview);

// ── F&F Settlement ────────────────────────────────────────────────
router.post('/exit-requests/:id/compute-fnf', requirePermissions(['hr:create']), controller.computeFnF);
router.get('/fnf-settlements', requirePermissions(['hr:read']), controller.listFnFSettlements);
router.get('/fnf-settlements/:id', requirePermissions(['hr:read']), controller.getFnFSettlement);
router.patch('/fnf-settlements/:id/approve', requirePermissions(['hr:update']), controller.approveFnF);
router.patch('/fnf-settlements/:id/pay', requirePermissions(['hr:update']), controller.payFnF);

export { router as offboardingRoutes };
