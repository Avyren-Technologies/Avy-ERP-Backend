import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingEvaluationController } from './training-evaluation.controller';

const router = Router();

// ── Training Evaluations (Admin) ──────────────────────────────────────
router.post('/training-nominations/:id/evaluation', requirePermissions(['training-evaluation:create', 'hr:create']), trainingEvaluationController.submitEvaluation);
router.get('/training-nominations/:id/evaluation', requirePermissions(['training:read', 'hr:read']), trainingEvaluationController.getEvaluation);
router.get('/training-sessions/:id/evaluations', requirePermissions(['training:read', 'hr:read']), trainingEvaluationController.listSessionEvaluations);
router.get('/training-evaluations/summary', requirePermissions(['training:read', 'hr:read']), trainingEvaluationController.getEvaluationSummary);

export { router as trainingEvaluationRoutes };
