import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { orgStructureController as controller } from './org-structure.controller';

const router = Router();

// ── Departments ─────────────────────────────────────────────────────
router.get('/departments', requirePermissions(['hr:read']), controller.listDepartments);
router.post('/departments', requirePermissions(['hr:create']), controller.createDepartment);
router.get('/departments/:id', requirePermissions(['hr:read']), controller.getDepartment);
router.patch('/departments/:id', requirePermissions(['hr:update']), controller.updateDepartment);
router.delete('/departments/:id', requirePermissions(['hr:delete']), controller.deleteDepartment);

// ── Designations ────────────────────────────────────────────────────
router.get('/designations', requirePermissions(['hr:read']), controller.listDesignations);
router.post('/designations', requirePermissions(['hr:create']), controller.createDesignation);
router.get('/designations/:id', requirePermissions(['hr:read']), controller.getDesignation);
router.patch('/designations/:id', requirePermissions(['hr:update']), controller.updateDesignation);
router.delete('/designations/:id', requirePermissions(['hr:delete']), controller.deleteDesignation);

// ── Grades ──────────────────────────────────────────────────────────
router.get('/grades', requirePermissions(['hr:read']), controller.listGrades);
router.post('/grades', requirePermissions(['hr:create']), controller.createGrade);
router.get('/grades/:id', requirePermissions(['hr:read']), controller.getGrade);
router.patch('/grades/:id', requirePermissions(['hr:update']), controller.updateGrade);
router.delete('/grades/:id', requirePermissions(['hr:delete']), controller.deleteGrade);

// ── Employee Types ──────────────────────────────────────────────────
router.get('/employee-types', requirePermissions(['hr:read']), controller.listEmployeeTypes);
router.post('/employee-types', requirePermissions(['hr:create']), controller.createEmployeeType);
router.get('/employee-types/:id', requirePermissions(['hr:read']), controller.getEmployeeType);
router.patch('/employee-types/:id', requirePermissions(['hr:update']), controller.updateEmployeeType);
router.delete('/employee-types/:id', requirePermissions(['hr:delete']), controller.deleteEmployeeType);

// ── Cost Centres ────────────────────────────────────────────────────
router.get('/cost-centres', requirePermissions(['hr:read']), controller.listCostCentres);
router.post('/cost-centres', requirePermissions(['hr:create']), controller.createCostCentre);
router.get('/cost-centres/:id', requirePermissions(['hr:read']), controller.getCostCentre);
router.patch('/cost-centres/:id', requirePermissions(['hr:update']), controller.updateCostCentre);
router.delete('/cost-centres/:id', requirePermissions(['hr:delete']), controller.deleteCostCentre);

export { router as orgStructureRoutes };
