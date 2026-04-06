import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { evaluationController as controller } from './evaluation.controller';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// INTERVIEW EVALUATIONS
// ═══════════════════════════════════════════════════════════════════
router.post('/interviews/:id/evaluations', requirePermissions(['hr:create']), controller.submitEvaluations);
router.get('/interviews/:id/evaluations', requirePermissions(['hr:read']), controller.listEvaluations);

export { router as evaluationRoutes };
