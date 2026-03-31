import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { employeeController } from './employee.controller';

const router = Router();

// ── Employee CRUD ─────────────────────────────────────────────────────
router.get('/employees', requirePermissions(['hr:read', 'ess:view-directory']), employeeController.listEmployees);
router.post('/employees', requirePermissions(['hr:create']), employeeController.createEmployee);

// ── Probation (RED-7) — MUST be before /:id catch-all ────────────────
router.get('/employees/probation-due', requirePermissions(['hr:read']), employeeController.listProbationDue);

// ── Org Chart (ORA-10) — MUST be before /:id catch-all ───────────────
router.get('/employees/org-chart', requirePermissions(['hr:read', 'ess:view-org-chart']), employeeController.getOrgChart);

router.get('/employees/:id', requirePermissions(['hr:read', 'ess:view-profile']), employeeController.getEmployee);
router.patch('/employees/:id', requirePermissions(['hr:update']), employeeController.updateEmployee);
router.patch('/employees/:id/status', requirePermissions(['hr:update']), employeeController.updateEmployeeStatus);
router.delete('/employees/:id', requirePermissions(['hr:delete']), employeeController.deleteEmployee);
router.post('/employees/:id/probation-review', requirePermissions(['hr:update']), employeeController.submitProbationReview);

// ── Nominees ──────────────────────────────────────────────────────────
router.get('/employees/:id/nominees', requirePermissions(['hr:read']), employeeController.listNominees);
router.post('/employees/:id/nominees', requirePermissions(['hr:create']), employeeController.addNominee);
router.patch('/employees/:id/nominees/:nid', requirePermissions(['hr:update']), employeeController.updateNominee);
router.delete('/employees/:id/nominees/:nid', requirePermissions(['hr:delete']), employeeController.deleteNominee);

// ── Education ─────────────────────────────────────────────────────────
router.get('/employees/:id/education', requirePermissions(['hr:read']), employeeController.listEducation);
router.post('/employees/:id/education', requirePermissions(['hr:create']), employeeController.addEducation);
router.patch('/employees/:id/education/:eid', requirePermissions(['hr:update']), employeeController.updateEducation);
router.delete('/employees/:id/education/:eid', requirePermissions(['hr:delete']), employeeController.deleteEducation);

// ── Previous Employment ───────────────────────────────────────────────
router.get('/employees/:id/previous-employment', requirePermissions(['hr:read']), employeeController.listPrevEmployment);
router.post('/employees/:id/previous-employment', requirePermissions(['hr:create']), employeeController.addPrevEmployment);
router.patch('/employees/:id/previous-employment/:pid', requirePermissions(['hr:update']), employeeController.updatePrevEmployment);
router.delete('/employees/:id/previous-employment/:pid', requirePermissions(['hr:delete']), employeeController.deletePrevEmployment);

// ── Documents ─────────────────────────────────────────────────────────
router.get('/employees/:id/documents', requirePermissions(['hr:read']), employeeController.listDocuments);
router.post('/employees/:id/documents', requirePermissions(['hr:create']), employeeController.addDocument);
router.patch('/employees/:id/documents/:did', requirePermissions(['hr:update']), employeeController.updateDocument);
router.delete('/employees/:id/documents/:did', requirePermissions(['hr:delete']), employeeController.deleteDocument);

// ── Timeline ──────────────────────────────────────────────────────────
router.get('/employees/:id/timeline', requirePermissions(['hr:read']), employeeController.getTimeline);

export { router as employeeRoutes };
