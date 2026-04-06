import { Request, Response } from 'express';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { trainingEvaluationService } from './training-evaluation.service';
import { createTrainingEvaluationSchema, submitEssFeedbackSchema } from './training-evaluation.validators';

class TrainingEvaluationController {
  // ════════════════════════════════════════════════════════════════
  // ADMIN: Submit evaluation
  // ════════════════════════════════════════════════════════════════

  submitEvaluation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createTrainingEvaluationSchema.safeParse({
      ...req.body,
      nominationId: req.params.id,
    });
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const evaluation = await trainingEvaluationService.submitEvaluation(companyId, parsed.data, req.user?.id);
    res.status(201).json(createSuccessResponse(evaluation, 'Evaluation submitted'));
  });

  // ════════════════════════════════════════════════════════════════
  // ADMIN: Get evaluation for nomination
  // ════════════════════════════════════════════════════════════════

  getEvaluation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const evaluations = await trainingEvaluationService.getEvaluation(companyId, req.params.id!);
    res.json(createSuccessResponse(evaluations, 'Evaluations retrieved'));
  });

  // ════════════════════════════════════════════════════════════════
  // ADMIN: List session evaluations
  // ════════════════════════════════════════════════════════════════

  listSessionEvaluations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const evaluations = await trainingEvaluationService.listSessionEvaluations(companyId, req.params.id!);
    res.json(createSuccessResponse(evaluations, 'Session evaluations retrieved'));
  });

  // ════════════════════════════════════════════════════════════════
  // ADMIN: Evaluation summary for a training
  // ════════════════════════════════════════════════════════════════

  getEvaluationSummary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const trainingId = req.query.trainingId as string;
    if (!trainingId) throw ApiError.badRequest('trainingId query parameter is required');

    const summary = await trainingEvaluationService.getEvaluationSummary(companyId, trainingId);
    res.json(createSuccessResponse(summary, 'Evaluation summary retrieved'));
  });

  // ════════════════════════════════════════════════════════════════
  // ESS: Employee submits own feedback
  // ════════════════════════════════════════════════════════════════

  submitEssFeedback = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID and user ID are required');

    const parsed = submitEssFeedbackSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const nominationId = req.params.nominationId!;
    const evaluation = await trainingEvaluationService.submitEssFeedback(companyId, nominationId, parsed.data, userId);
    res.status(201).json(createSuccessResponse(evaluation, 'Training feedback submitted'));
  });
}

export const trainingEvaluationController = new TrainingEvaluationController();
