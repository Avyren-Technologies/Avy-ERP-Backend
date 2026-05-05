import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { gateController } from './gate.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.gates:read']), gateController.list);
router.post('/', requirePermissions(['visitors.gates:configure']), gateController.create);
router.get('/:id', requirePermissions(['visitors.gates:read']), gateController.getById);
router.put('/:id', requirePermissions(['visitors.gates:configure']), gateController.update);
router.delete('/:id', requirePermissions(['visitors.gates:configure']), gateController.deactivate);

export { router as gateRoutes };
