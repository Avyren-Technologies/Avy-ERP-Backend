import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingSessionController } from './training-session.controller';

const router = Router();

router.get('/', requirePermissions(['training:read', 'hr:read']), trainingSessionController.listSessions);
router.post('/', requirePermissions(['training:create', 'hr:create']), trainingSessionController.createSession);
router.get('/:id', requirePermissions(['training:read', 'hr:read']), trainingSessionController.getSession);
router.patch('/:id', requirePermissions(['training:update', 'hr:update']), trainingSessionController.updateSession);
router.patch('/:id/status', requirePermissions(['training:update', 'hr:update']), trainingSessionController.updateSessionStatus);
router.delete('/:id', requirePermissions(['training:delete', 'hr:delete']), trainingSessionController.deleteSession);

export { router as trainingSessionRoutes };
