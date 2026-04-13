import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { visitController } from './visit.controller';

const router = Router();

// List visits (with filters)
router.get('/', requirePermissions(['visitors:read']), visitController.listVisits);

// Named routes BEFORE :id routes
router.get('/code/:visitCode', requirePermissions(['visitors:read']), visitController.getVisitByCode);

// Create pre-registration
router.post('/', requirePermissions(['visitors:create']), visitController.createVisit);

// Visit by ID
router.get('/:id', requirePermissions(['visitors:read']), visitController.getVisitById);
router.put('/:id', requirePermissions(['visitors:update']), visitController.updateVisit);
router.delete('/:id', requirePermissions(['visitors:delete']), visitController.cancelVisit);

// Visit actions
router.post('/:id/check-in', requirePermissions(['visitors:create']), visitController.checkIn);
router.post('/:id/check-out', requirePermissions(['visitors:create']), visitController.checkOut);
router.post('/:id/approve', requirePermissions(['visitors:approve']), visitController.approve);
router.post('/:id/reject', requirePermissions(['visitors:approve']), visitController.reject);
router.post('/:id/extend', requirePermissions(['visitors:update']), visitController.extend);
router.post('/:id/complete-induction', requirePermissions(['visitors:create']), visitController.completeInduction);

export { router as visitRoutes };
