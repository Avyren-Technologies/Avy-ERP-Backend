import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { groupVisitController } from './group-visit.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.group-visits:read']), groupVisitController.list);
router.post('/', requirePermissions(['visitors.group-visits:create']), groupVisitController.create);
router.get('/:id', requirePermissions(['visitors.group-visits:read']), groupVisitController.getById);
router.put('/:id', requirePermissions(['visitors.group-visits:update']), groupVisitController.update);
router.post('/:id/batch-check-in', requirePermissions(['visitors.gate-checkin:create']), groupVisitController.batchCheckIn);
router.post('/:id/batch-check-out', requirePermissions(['visitors.group-visits:update']), groupVisitController.batchCheckOut);

export { router as groupVisitRoutes };
