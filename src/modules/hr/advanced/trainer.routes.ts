import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainerController } from './trainer.controller';

const router = Router();

router.get('/', requirePermissions(['hr:read']), trainerController.listTrainers);
router.post('/', requirePermissions(['hr:create']), trainerController.createTrainer);
router.get('/:id', requirePermissions(['hr:read']), trainerController.getTrainer);
router.patch('/:id', requirePermissions(['hr:update']), trainerController.updateTrainer);
router.delete('/:id', requirePermissions(['hr:delete']), trainerController.deleteTrainer);

export { router as trainerRoutes };
