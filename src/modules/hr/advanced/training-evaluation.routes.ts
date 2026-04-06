import { Router } from 'express';
import { requirePermissions } from '../../../middleware/auth.middleware';
import { trainingEvaluationController } from './training-evaluation.controller';

const router = Router();

// ── Training Evaluations (Admin) ──────────────────────────────────────
router.post('/training-nominations/:id/evaluation', requirePermissions(['hr:create']), trainingEvaluationController.submitEvaluation);
router.get('/training-nominations/:id/evaluation', requirePermissions(['hr:read']), trainingEvaluationController.getEvaluation);
router.get('/training-sessions/:id/evaluations', requirePermissions(['hr:read']), trainingEvaluationController.listSessionEvaluations);
router.get('/training-evaluations/summary', requirePermissions(['hr:read']), trainingEvaluationController.getEvaluationSummary);

export { router as trainingEvaluationRoutes };
