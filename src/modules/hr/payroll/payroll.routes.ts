import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { requireModuleEnabled } from '../../../shared/middleware/config-enforcement.middleware';
import { payrollController as controller } from './payroll.controller';

const router = Router();

// ── Module Enforcement ──────────────────────────────────────────────
router.use(requireModuleEnabled('payroll'));

// ── Salary Components ─────────────────────────────────────────────────
router.get('/salary-components', requirePermissions(['hr:read']), controller.listSalaryComponents);
router.post('/salary-components', requirePermissions(['hr:create']), controller.createSalaryComponent);
router.get('/salary-components/:id', requirePermissions(['hr:read']), controller.getSalaryComponent);
router.patch('/salary-components/:id', requirePermissions(['hr:update']), controller.updateSalaryComponent);
router.delete('/salary-components/:id', requirePermissions(['hr:delete']), controller.deleteSalaryComponent);

// ── Salary Structures ─────────────────────────────────────────────────
router.get('/salary-structures', requirePermissions(['hr:read']), controller.listSalaryStructures);
router.post('/salary-structures', requirePermissions(['hr:create']), controller.createSalaryStructure);
router.get('/salary-structures/:id', requirePermissions(['hr:read']), controller.getSalaryStructure);
router.patch('/salary-structures/:id', requirePermissions(['hr:update']), controller.updateSalaryStructure);
router.delete('/salary-structures/:id', requirePermissions(['hr:delete']), controller.deleteSalaryStructure);

// ── Employee Salary ───────────────────────────────────────────────────
router.get('/employee-salaries', requirePermissions(['hr:read']), controller.listEmployeeSalaries);
router.post('/employee-salaries', requirePermissions(['hr:create']), controller.assignSalary);
router.get('/employee-salaries/:id', requirePermissions(['hr:read']), controller.getEmployeeSalary);
router.patch('/employee-salaries/:id', requirePermissions(['hr:update']), controller.updateEmployeeSalary);

// ── Statutory Configs (singleton — payroll/ prefix) ───────────────────
router.get('/payroll/pf-config', requirePermissions(['hr:read']), controller.getPFConfig);
router.patch('/payroll/pf-config', requirePermissions(['hr:update']), controller.updatePFConfig);

router.get('/payroll/esi-config', requirePermissions(['hr:read']), controller.getESIConfig);
router.patch('/payroll/esi-config', requirePermissions(['hr:update']), controller.updateESIConfig);

router.get('/payroll/pt-configs', requirePermissions(['hr:read']), controller.listPTConfigs);
router.post('/payroll/pt-configs', requirePermissions(['hr:create']), controller.createPTConfig);
router.patch('/payroll/pt-configs/:id', requirePermissions(['hr:update']), controller.updatePTConfig);
router.delete('/payroll/pt-configs/:id', requirePermissions(['hr:delete']), controller.deletePTConfig);

router.get('/payroll/gratuity-config', requirePermissions(['hr:read']), controller.getGratuityConfig);
router.patch('/payroll/gratuity-config', requirePermissions(['hr:update']), controller.updateGratuityConfig);

router.get('/payroll/bonus-config', requirePermissions(['hr:read']), controller.getBonusConfig);
router.patch('/payroll/bonus-config', requirePermissions(['hr:update']), controller.updateBonusConfig);

router.get('/payroll/lwf-configs', requirePermissions(['hr:read']), controller.listLWFConfigs);
router.post('/payroll/lwf-configs', requirePermissions(['hr:create']), controller.createLWFConfig);
router.patch('/payroll/lwf-configs/:id', requirePermissions(['hr:update']), controller.updateLWFConfig);
router.delete('/payroll/lwf-configs/:id', requirePermissions(['hr:delete']), controller.deleteLWFConfig);

router.get('/payroll/bank-config', requirePermissions(['hr:read']), controller.getBankConfig);
router.patch('/payroll/bank-config', requirePermissions(['hr:update']), controller.updateBankConfig);

router.get('/payroll/tax-config', requirePermissions(['hr:read']), controller.getTaxConfig);
router.patch('/payroll/tax-config', requirePermissions(['hr:update']), controller.updateTaxConfig);

// ── Loan Policies ─────────────────────────────────────────────────────
router.get('/loan-policies', requirePermissions(['hr:read']), controller.listLoanPolicies);
router.post('/loan-policies', requirePermissions(['hr:create']), controller.createLoanPolicy);
router.get('/loan-policies/:id', requirePermissions(['hr:read']), controller.getLoanPolicy);
router.patch('/loan-policies/:id', requirePermissions(['hr:update']), controller.updateLoanPolicy);
router.delete('/loan-policies/:id', requirePermissions(['hr:delete']), controller.deleteLoanPolicy);

// ── Travel Advance (must be before /loans/:id to avoid param capture) ─
router.post('/loans/travel-advance', requirePermissions(['hr:create']), controller.createTravelAdvance);
router.get('/loans/travel-advances', requirePermissions(['hr:read']), controller.listTravelAdvances);

// ── Loans ─────────────────────────────────────────────────────────────
router.get('/loans', requirePermissions(['hr:read']), controller.listLoans);
router.post('/loans', requirePermissions(['hr:create']), controller.createLoan);
router.get('/loans/:id', requirePermissions(['hr:read']), controller.getLoan);
router.patch('/loans/:id', requirePermissions(['hr:update']), controller.updateLoan);
router.patch('/loans/:id/status', requirePermissions(['hr:update']), controller.updateLoanStatus);
router.post('/loans/:id/settle-travel', requirePermissions(['hr:update']), controller.settleTravelAdvance);

export { router as payrollRoutes };
