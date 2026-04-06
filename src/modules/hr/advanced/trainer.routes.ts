import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainerController } from './trainer.controller';

const router = Router();

router.get('/', requirePermissions(['training:read', 'hr:read']), trainerController.listTrainers);
router.post('/', requirePermissions(['training:create', 'hr:create']), trainerController.createTrainer);
router.get('/:id', requirePermissions(['training:read', 'hr:read']), trainerController.getTrainer);
router.patch('/:id', requirePermissions(['training:update', 'hr:update']), trainerController.updateTrainer);
router.delete('/:id', requirePermissions(['training:delete', 'hr:delete']), trainerController.deleteTrainer);

export { router as trainerRoutes };
