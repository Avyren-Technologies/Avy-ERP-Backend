import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { requireModuleEnabled, requireESSFeature } from '../../../shared/middleware/config-enforcement.middleware';
import { essController as controller } from './ess.controller';

const router = Router();

// ── Module Enforcement ──────────────────────────────────────────────
router.use(requireModuleEnabled('ess'));

// ── ESS Config (admin-facing) ───────────────────────────────────────
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

// ── Shift Check-In / Check-Out (ESS feature gated) ─────────────────
router.get('/attendance/my-status', requireESSFeature('attendanceView'), requirePermissions(['hr:read', 'ess:view-attendance']), controller.getMyAttendanceStatus);
router.post('/attendance/check-in', requireESSFeature('attendanceView'), requirePermissions(['hr:create', 'ess:view-attendance']), controller.checkIn);
router.post('/attendance/check-out', requireESSFeature('attendanceView'), requirePermissions(['hr:create', 'ess:view-attendance']), controller.checkOut);

// ── Manager Delegates ───────────────────────────────────────────────
router.get('/delegates', requirePermissions(['hr:read']), controller.listDelegates);
router.post('/delegates', requirePermissions(['hr:create']), controller.createDelegate);
router.patch('/delegates/:id/revoke', requirePermissions(['hr:update']), controller.revokeDelegate);

// ── IT Declarations (ESS feature gated) ─────────────────────────────
router.get('/it-declarations', requireESSFeature('itDeclaration'), requirePermissions(['hr:read', 'ess:it-declaration']), controller.listDeclarations);
router.post('/it-declarations', requireESSFeature('itDeclaration'), requirePermissions(['hr:create', 'ess:it-declaration']), controller.createDeclaration);
router.get('/it-declarations/:id', requireESSFeature('itDeclaration'), requirePermissions(['hr:read', 'ess:it-declaration']), controller.getDeclaration);
router.patch('/it-declarations/:id', requireESSFeature('itDeclaration'), requirePermissions(['hr:update', 'ess:it-declaration']), controller.updateDeclaration);
router.patch('/it-declarations/:id/submit', requireESSFeature('itDeclaration'), requirePermissions(['hr:update', 'ess:it-declaration']), controller.submitDeclaration);
router.patch('/it-declarations/:id/verify', requirePermissions(['hr:update']), controller.verifyDeclaration);
router.patch('/it-declarations/:id/lock', requirePermissions(['hr:update']), controller.lockDeclaration);

// ── ESS Self-Service (Employee-facing, feature gated) ───────────────
router.get('/ess/my-profile', requireESSFeature('profileUpdate'), requirePermissions(['hr:read', 'ess:view-profile']), controller.getMyProfile);
router.get('/ess/my-payslips', requireESSFeature('viewPayslips'), requirePermissions(['hr:read', 'ess:view-payslips']), controller.getMyPayslips);
router.get('/ess/my-leave-balance', requireESSFeature('leaveBalanceView'), requirePermissions(['hr:read', 'ess:view-leave']), controller.getMyLeaveBalance);
router.get('/ess/my-attendance', requireESSFeature('attendanceView'), requirePermissions(['hr:read', 'ess:view-attendance']), controller.getMyAttendance);
router.get('/ess/my-declarations', requireESSFeature('itDeclaration'), requirePermissions(['hr:read', 'ess:it-declaration']), controller.getMyDeclarations);
router.post('/ess/apply-leave', requireESSFeature('leaveApplication'), requirePermissions(['hr:create', 'ess:apply-leave']), controller.applyLeave);
router.post('/ess/regularize-attendance', requireESSFeature('attendanceRegularization'), requirePermissions(['hr:create', 'ess:regularize-attendance']), controller.regularizeAttendance);

// ── ESS: Goals, Grievances, Training, Assets, Form 16 (feature gated) ──
router.get('/ess/my-goals', requireESSFeature('performanceGoals'), requirePermissions(['hr:read', 'ess:view-goals']), controller.getMyGoals);
router.get('/ess/my-grievances', requireESSFeature('grievanceSubmission'), requirePermissions(['hr:read', 'ess:raise-grievance']), controller.getMyGrievances);
router.post('/ess/file-grievance', requireESSFeature('grievanceSubmission'), requirePermissions(['hr:create', 'ess:raise-grievance']), controller.fileGrievance);
router.get('/ess/my-training', requireESSFeature('trainingEnrollment'), requirePermissions(['hr:read', 'ess:enroll-training']), controller.getMyTraining);
router.get('/ess/my-assets', requireESSFeature('assetView'), requirePermissions(['hr:read', 'ess:view-assets']), controller.getMyAssets);
router.get('/ess/my-form16', requireESSFeature('downloadForm16'), requirePermissions(['hr:read', 'ess:download-form16']), controller.getMyForm16);

// ── MSS Manager Self-Service (feature gated) ────────────────────────
router.get('/mss/team-members', requireESSFeature('mssViewTeam'), requirePermissions(['hr:read']), controller.getTeamMembers);
router.get('/mss/pending-approvals', requireESSFeature('mssApproveLeave'), requirePermissions(['hr:read']), controller.getPendingManagerApprovals);
router.get('/mss/team-attendance', requireESSFeature('mssViewTeamAttendance'), requirePermissions(['hr:read']), controller.getTeamAttendance);
router.get('/mss/team-leave-calendar', requireESSFeature('mssApproveLeave'), requirePermissions(['hr:read']), controller.getTeamLeaveCalendar);

export { router as essRoutes };
