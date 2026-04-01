import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { requireModuleEnabled } from '../../../shared/middleware/config-enforcement.middleware';
import { payrollRunController as controller } from './payroll-run.controller';

const router = Router();

// ── Module Enforcement ──────────────────────────────────────────────
router.use(requireModuleEnabled('payroll'));

// ── Payroll Runs ─────────────────────────────────────────────────────
router.get('/payroll-runs', requirePermissions(['hr:read']), controller.listRuns);
router.post('/payroll-runs', requirePermissions(['hr:create']), controller.createRun);
router.get('/payroll-runs/:id', requirePermissions(['hr:read']), controller.getRun);
router.delete('/payroll-runs/:id', requirePermissions(['hr:delete']), controller.deleteRun);

// ── 6-Step Wizard ────────────────────────────────────────────────────
router.patch('/payroll-runs/:id/lock-attendance', requirePermissions(['hr:update']), controller.lockAttendance);
router.patch('/payroll-runs/:id/review-exceptions', requirePermissions(['hr:update']), controller.reviewExceptions);
router.patch('/payroll-runs/:id/compute', requirePermissions(['hr:update']), controller.computeSalaries);
router.patch('/payroll-runs/:id/statutory', requirePermissions(['hr:update']), controller.computeStatutory);
router.patch('/payroll-runs/:id/approve', requirePermissions(['hr:update']), controller.approveRun);
router.patch('/payroll-runs/:id/disburse', requirePermissions(['hr:update']), controller.disburseRun);

// ── Payroll Entries ──────────────────────────────────────────────────
router.get('/payroll-runs/:id/entries', requirePermissions(['hr:read']), controller.listEntries);
router.get('/payroll-runs/:id/entries/:eid', requirePermissions(['hr:read']), controller.getEntry);
router.patch('/payroll-runs/:id/entries/:eid', requirePermissions(['hr:update']), controller.overrideEntry);

// ── Payslips ─────────────────────────────────────────────────────────
router.get('/payslips', requirePermissions(['hr:read']), controller.listPayslips);
router.get('/payslips/:id', requirePermissions(['hr:read']), controller.getPayslip);
router.post('/payslips/:id/email', requirePermissions(['hr:update']), controller.emailPayslip);
router.post('/payroll-runs/:id/generate-payslips', requirePermissions(['hr:create']), controller.generatePayslips);
router.post('/payroll-runs/:id/bulk-email-payslips', requirePermissions(['hr:update']), controller.bulkEmailPayslips);

// ── Salary Holds ─────────────────────────────────────────────────────
router.get('/salary-holds', requirePermissions(['hr:read']), controller.listHolds);
router.post('/salary-holds', requirePermissions(['hr:create']), controller.createHold);
router.patch('/salary-holds/:id/release', requirePermissions(['hr:update']), controller.releaseHold);

// ── Salary Revisions ─────────────────────────────────────────────────
router.get('/salary-revisions', requirePermissions(['hr:read']), controller.listRevisions);
router.post('/salary-revisions', requirePermissions(['hr:create']), controller.createRevision);
router.post('/salary-revisions/bulk', requirePermissions(['hr:create']), controller.bulkCreateRevisions);
router.get('/salary-revisions/:id', requirePermissions(['hr:read']), controller.getRevision);
router.patch('/salary-revisions/:id/approve', requirePermissions(['hr:update']), controller.approveRevision);
router.patch('/salary-revisions/:id/apply', requirePermissions(['hr:update']), controller.applyRevision);

// ── Arrear Entries ───────────────────────────────────────────────────
router.get('/arrear-entries', requirePermissions(['hr:read']), controller.listArrears);

// ── Statutory Filings ────────────────────────────────────────────────
router.get('/statutory-filings', requirePermissions(['hr:read']), controller.listFilings);
router.post('/statutory-filings', requirePermissions(['hr:create']), controller.createFiling);
router.patch('/statutory-filings/:id', requirePermissions(['hr:update']), controller.updateFiling);
router.get('/statutory/dashboard', requirePermissions(['hr:read']), controller.getStatutoryDashboard);

// ── Reports ──────────────────────────────────────────────────────────
router.get('/payroll-reports/gl-journal', requirePermissions(['hr:read']), controller.getGLJournalExport);
router.get('/payroll-reports/salary-register', requirePermissions(['hr:read']), controller.getSalaryRegister);
router.get('/payroll-reports/bank-file', requirePermissions(['hr:read']), controller.getBankFile);
router.get('/payroll-reports/pf-ecr', requirePermissions(['hr:read']), controller.getPFECR);
router.get('/payroll-reports/esi-challan', requirePermissions(['hr:read']), controller.getESIChallan);
router.get('/payroll-reports/pt-challan', requirePermissions(['hr:read']), controller.getPTChallan);
router.get('/payroll-reports/variance', requirePermissions(['hr:read']), controller.getVarianceReport);

// ── RED-4: Form 16 & 24Q ────────────────────────────────────────
router.post('/payroll-reports/form-16', requirePermissions(['hr:create']), controller.generateForm16);
router.post('/payroll-reports/form-24q', requirePermissions(['hr:create']), controller.generateForm24Q);
router.post('/payroll-reports/form-16/bulk-email', requirePermissions(['hr:update']), controller.bulkEmailForm16);

export { router as payrollRunRoutes };
