import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { evaluationController as controller } from './evaluation.controller';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// INTERVIEW EVALUATIONS
// ═══════════════════════════════════════════════════════════════════
router.post('/interviews/:id/evaluations', requirePermissions(['recruitment:create', 'hr:create']), controller.submitEvaluations);
router.get('/interviews/:id/evaluations', requirePermissions(['recruitment:read', 'hr:read']), controller.listEvaluations);

export { router as evaluationRoutes };
