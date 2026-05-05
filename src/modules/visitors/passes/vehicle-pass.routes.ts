import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { vehiclePassController } from './vehicle-pass.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.vehicle-passes:read']), vehiclePassController.list);
router.post('/', requirePermissions(['visitors.vehicle-passes:create']), vehiclePassController.create);
router.get('/:id', requirePermissions(['visitors.vehicle-passes:read']), vehiclePassController.getById);
router.post('/:id/exit', requirePermissions(['visitors.vehicle-passes:update']), vehiclePassController.recordExit);

export { router as vehiclePassRoutes };
