import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingSessionController } from './training-session.controller';

const router = Router();

router.get('/', requirePermissions(['hr:read']), trainingSessionController.listSessions);
router.post('/', requirePermissions(['hr:create']), trainingSessionController.createSession);
router.get('/:id', requirePermissions(['hr:read']), trainingSessionController.getSession);
router.patch('/:id', requirePermissions(['hr:update']), trainingSessionController.updateSession);
router.patch('/:id/status', requirePermissions(['hr:update']), trainingSessionController.updateSessionStatus);
router.delete('/:id', requirePermissions(['hr:delete']), trainingSessionController.deleteSession);

export default router;
