import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { safetyInductionController } from './safety-induction.controller';

const router = Router();

router.get('/', requirePermissions(['visitors.inductions:read']), safetyInductionController.list);
router.post('/', requirePermissions(['visitors.inductions:configure']), safetyInductionController.create);
router.get('/:id', requirePermissions(['visitors.inductions:read']), safetyInductionController.getById);
router.put('/:id', requirePermissions(['visitors.inductions:configure']), safetyInductionController.update);
router.delete('/:id', requirePermissions(['visitors.inductions:configure']), safetyInductionController.deactivate);

export { router as safetyInductionRoutes };
