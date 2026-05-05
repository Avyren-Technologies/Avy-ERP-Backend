import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { visitController } from './visit.controller';

const router = Router();

// List visits (with filters)
router.get('/', requirePermissions(['visitors.visits:read']), visitController.listVisits);


// Named routes BEFORE :id routes
router.get('/code/:visitCode', requirePermissions(['visitors.visits:read']), visitController.getVisitByCode);

// Create pre-registration
router.post('/', requirePermissions(['visitors.visits:create']), visitController.createVisit);

// Visit by ID
router.get('/:id', requirePermissions(['visitors.visits:read']), visitController.getVisitById);
router.put('/:id', requirePermissions(['visitors.visits:update']), visitController.updateVisit);
router.delete('/:id', requirePermissions(['visitors.visits:delete']), visitController.cancelVisit);

// Visit actions
router.post('/:id/check-in', requirePermissions(['visitors.gate-checkin:create']), visitController.checkIn);
router.post('/:id/check-out', requirePermissions(['visitors.visits:update']), visitController.checkOut);
router.post('/:id/approve', requirePermissions(['visitors.visits:approve']), visitController.approve);
router.post('/:id/reject', requirePermissions(['visitors.visits:approve']), visitController.reject);
router.post('/:id/extend', requirePermissions(['visitors.visits:update']), visitController.extend);
router.post('/:id/complete-induction', requirePermissions(['visitors.visits:update']), visitController.completeInduction);

export { router as visitRoutes };
