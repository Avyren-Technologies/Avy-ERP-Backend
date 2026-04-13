import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { safetyInductionController } from './safety-induction.controller';

const router = Router();

router.get('/', requirePermissions(['visitors:read']), safetyInductionController.list);
router.post('/', requirePermissions(['visitors:configure']), safetyInductionController.create);
router.get('/:id', requirePermissions(['visitors:read']), safetyInductionController.getById);
router.put('/:id', requirePermissions(['visitors:configure']), safetyInductionController.update);
router.delete('/:id', requirePermissions(['visitors:configure']), safetyInductionController.deactivate);

export { router as safetyInductionRoutes };
