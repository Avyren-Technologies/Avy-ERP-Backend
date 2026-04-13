import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { gateController } from './gate.controller';

const router = Router();

router.get('/', requirePermissions(['visitors:read']), gateController.list);
router.post('/', requirePermissions(['visitors:configure']), gateController.create);
router.get('/:id', requirePermissions(['visitors:read']), gateController.getById);
router.put('/:id', requirePermissions(['visitors:configure']), gateController.update);
router.delete('/:id', requirePermissions(['visitors:configure']), gateController.deactivate);

export { router as gateRoutes };
