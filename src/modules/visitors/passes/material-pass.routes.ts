import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { materialPassController } from './material-pass.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.material-passes:read']), materialPassController.list);
router.post('/', requirePermissions(['visitors.material-passes:create']), materialPassController.create);
router.get('/:id', requirePermissions(['visitors.material-passes:read']), materialPassController.getById);
router.post('/:id/return', requirePermissions(['visitors.material-passes:update']), materialPassController.markReturned);

export { router as materialPassRoutes };
