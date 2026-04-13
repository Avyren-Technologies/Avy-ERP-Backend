import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { recurringPassController } from './recurring-pass.controller';

const router = Router();

router.get('/', requirePermissions(['visitors:read']), recurringPassController.list);
router.post('/', requirePermissions(['visitors:create']), recurringPassController.create);
router.get('/:id', requirePermissions(['visitors:read']), recurringPassController.getById);
router.put('/:id', requirePermissions(['visitors:update']), recurringPassController.update);
router.post('/:id/revoke', requirePermissions(['visitors:delete']), recurringPassController.revoke);
router.post('/:id/check-in', requirePermissions(['visitors:create']), recurringPassController.checkIn);

export { router as recurringPassRoutes };
