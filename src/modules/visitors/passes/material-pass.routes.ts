import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { materialPassController } from './material-pass.controller';

const router = Router();

router.get('/', requirePermissions(['visitors:read']), materialPassController.list);
router.post('/', requirePermissions(['visitors:create']), materialPassController.create);
router.get('/:id', requirePermissions(['visitors:read']), materialPassController.getById);
router.post('/:id/return', requirePermissions(['visitors:update']), materialPassController.markReturned);

export { router as materialPassRoutes };
