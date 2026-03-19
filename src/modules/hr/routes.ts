import { Router, Request, Response } from 'express';
import { requirePermissions } from '../../middleware/auth.middleware';
import { asyncHandler } from '../../middleware/error.middleware';
import { createSuccessResponse } from '../../shared/utils';
import { orgStructureRoutes } from './org-structure/org-structure.routes';
import { employeeRoutes } from './employee/employee.routes';

const router = Router();

// Org structure masters (departments, designations, grades, employee-types, cost-centres)
router.use('/', orgStructureRoutes);

// Employee management (full CRUD + sub-resources: nominees, education, prev-employment, documents, timeline)
router.use('/', employeeRoutes);

// Attendance management
router.get('/attendance', requirePermissions(['hr:read']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'HR attendance endpoint - TODO: Implement' }));
}));

router.post('/attendance', requirePermissions(['hr:create']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Log attendance endpoint - TODO: Implement' }));
}));

// Leave management
router.get('/leave-requests', requirePermissions(['hr:read']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Leave requests endpoint - TODO: Implement' }));
}));

router.post('/leave-requests', requirePermissions(['hr:create']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Create leave request endpoint - TODO: Implement' }));
}));

router.put('/leave-requests/:id/approve', requirePermissions(['hr:update']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Approve leave request endpoint - TODO: Implement' }));
}));

// Payroll management
router.get('/payroll', requirePermissions(['hr:read']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Payroll endpoint - TODO: Implement' }));
}));

router.post('/payroll/process', requirePermissions(['hr:create']), asyncHandler(async (req: Request, res: Response) => {
  res.json(createSuccessResponse({ message: 'Process payroll endpoint - TODO: Implement' }));
}));

export { router as hrRoutes };