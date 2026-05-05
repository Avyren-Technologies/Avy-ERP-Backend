import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { recurringPassController } from './recurring-pass.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.recurring-passes:read']), recurringPassController.list);
router.post('/', requirePermissions(['visitors.recurring-passes:create']), recurringPassController.create);
router.get('/:id', requirePermissions(['visitors.recurring-passes:read']), recurringPassController.getById);
router.put('/:id', requirePermissions(['visitors.recurring-passes:update']), recurringPassController.update);
router.post('/:id/revoke', requirePermissions(['visitors.recurring-passes:delete']), recurringPassController.revoke);
router.post('/:id/check-in', requirePermissions(['visitors.gate-checkin:create']), recurringPassController.checkIn);

export { router as recurringPassRoutes };
