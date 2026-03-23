import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { essController as controller } from './ess.controller';

const router = Router();

// ── ESS Config ──────────────────────────────────────────────────────
router.get('/ess-config', requirePermissions(['hr:read']), controller.getESSConfig);
router.patch('/ess-config', requirePermissions(['hr:update']), controller.updateESSConfig);

// ── Approval Workflows ──────────────────────────────────────────────
router.get('/approval-workflows', requirePermissions(['hr:read']), controller.listWorkflows);
router.post('/approval-workflows', requirePermissions(['hr:create']), controller.createWorkflow);
router.get('/approval-workflows/:id', requirePermissions(['hr:read']), controller.getWorkflow);
router.patch('/approval-workflows/:id', requirePermissions(['hr:update']), controller.updateWorkflow);
router.delete('/approval-workflows/:id', requirePermissions(['hr:delete']), controller.deleteWorkflow);

// ── Approval Requests ───────────────────────────────────────────────
router.get('/approval-requests', requirePermissions(['hr:read']), controller.listRequests);
router.get('/approval-requests/pending', requirePermissions(['hr:read']), controller.getPendingRequests);
router.get('/approval-requests/:id', requirePermissions(['hr:read']), controller.getRequest);
router.patch('/approval-requests/:id/approve', requirePermissions(['hr:update']), controller.approveRequest);
router.patch('/approval-requests/:id/reject', requirePermissions(['hr:update']), controller.rejectRequest);

// ── Notification Templates ──────────────────────────────────────────
router.get('/notification-templates', requirePermissions(['hr:read']), controller.listTemplates);
router.post('/notification-templates', requirePermissions(['hr:create']), controller.createTemplate);
router.get('/notification-templates/:id', requirePermissions(['hr:read']), controller.getTemplate);
router.patch('/notification-templates/:id', requirePermissions(['hr:update']), controller.updateTemplate);
router.delete('/notification-templates/:id', requirePermissions(['hr:delete']), controller.deleteTemplate);

// ── Notification Rules ──────────────────────────────────────────────
router.get('/notification-rules', requirePermissions(['hr:read']), controller.listRules);
router.post('/notification-rules', requirePermissions(['hr:create']), controller.createRule);
router.get('/notification-rules/:id', requirePermissions(['hr:read']), controller.getRuleById);
router.patch('/notification-rules/:id', requirePermissions(['hr:update']), controller.updateRule);
router.delete('/notification-rules/:id', requirePermissions(['hr:delete']), controller.deleteRule);

// ── Shift Check-In / Check-Out ──────────────────────────────────────
router.get('/attendance/my-status', requirePermissions(['hr:read']), controller.getMyAttendanceStatus);
router.post('/attendance/check-in', requirePermissions(['hr:create']), controller.checkIn);
router.post('/attendance/check-out', requirePermissions(['hr:create']), controller.checkOut);

// ── Manager Delegates ───────────────────────────────────────────────
router.get('/delegates', requirePermissions(['hr:read']), controller.listDelegates);
router.post('/delegates', requirePermissions(['hr:create']), controller.createDelegate);
router.patch('/delegates/:id/revoke', requirePermissions(['hr:update']), controller.revokeDelegate);

// ── IT Declarations ─────────────────────────────────────────────────
router.get('/it-declarations', requirePermissions(['hr:read']), controller.listDeclarations);
router.post('/it-declarations', requirePermissions(['hr:create']), controller.createDeclaration);
router.get('/it-declarations/:id', requirePermissions(['hr:read']), controller.getDeclaration);
router.patch('/it-declarations/:id', requirePermissions(['hr:update']), controller.updateDeclaration);
router.patch('/it-declarations/:id/submit', requirePermissions(['hr:update']), controller.submitDeclaration);
router.patch('/it-declarations/:id/verify', requirePermissions(['hr:update']), controller.verifyDeclaration);
router.patch('/it-declarations/:id/lock', requirePermissions(['hr:update']), controller.lockDeclaration);

// ── ESS Self-Service (Employee-facing) ──────────────────────────────
router.get('/ess/my-profile', requirePermissions(['hr:read']), controller.getMyProfile);
router.get('/ess/my-payslips', requirePermissions(['hr:read']), controller.getMyPayslips);
router.get('/ess/my-leave-balance', requirePermissions(['hr:read']), controller.getMyLeaveBalance);
router.get('/ess/my-attendance', requirePermissions(['hr:read']), controller.getMyAttendance);
router.get('/ess/my-declarations', requirePermissions(['hr:read']), controller.getMyDeclarations);
router.post('/ess/apply-leave', requirePermissions(['hr:create']), controller.applyLeave);
router.post('/ess/regularize-attendance', requirePermissions(['hr:create']), controller.regularizeAttendance);

// ── MSS Manager Self-Service ────────────────────────────────────────
router.get('/mss/team-members', requirePermissions(['hr:read']), controller.getTeamMembers);
router.get('/mss/pending-approvals', requirePermissions(['hr:read']), controller.getPendingManagerApprovals);
router.get('/mss/team-attendance', requirePermissions(['hr:read']), controller.getTeamAttendance);
router.get('/mss/team-leave-calendar', requirePermissions(['hr:read']), controller.getTeamLeaveCalendar);

export { router as essRoutes };
