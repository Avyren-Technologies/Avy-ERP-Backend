import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { groupVisitController } from './group-visit.controller';

const router = Router();

router.get('/', requirePermissions(['visitors:read']), groupVisitController.list);
router.post('/', requirePermissions(['visitors:create']), groupVisitController.create);
router.get('/:id', requirePermissions(['visitors:read']), groupVisitController.getById);
router.put('/:id', requirePermissions(['visitors:update']), groupVisitController.update);
router.post('/:id/batch-check-in', requirePermissions(['visitors:create']), groupVisitController.batchCheckIn);
router.post('/:id/batch-check-out', requirePermissions(['visitors:create']), groupVisitController.batchCheckOut);

export { router as groupVisitRoutes };
