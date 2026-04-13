import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { vehiclePassController } from './vehicle-pass.controller';

const router = Router();

router.get('/', requirePermissions(['visitors:read']), vehiclePassController.list);
router.post('/', requirePermissions(['visitors:create']), vehiclePassController.create);
router.get('/:id', requirePermissions(['visitors:read']), vehiclePassController.getById);
router.post('/:id/exit', requirePermissions(['visitors:create']), vehiclePassController.recordExit);

export { router as vehiclePassRoutes };
