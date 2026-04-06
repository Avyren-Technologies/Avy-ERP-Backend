import { Request, Response } from 'express';
import { evaluationService } from './evaluation.service';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { createEvaluationSchema } from './evaluation.validators';

export class EvaluationController {
  submitEvaluations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const evaluatorId = req.user?.id;
    if (!evaluatorId) throw ApiError.badRequest('User ID is required');

    const parsed = createEvaluationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const evaluations = await evaluationService.submitEvaluations(
      companyId,
      req.params.id!,
      evaluatorId,
      parsed.data,
    );
    res.json(createSuccessResponse(evaluations, 'Evaluations submitted'));
  });

  listEvaluations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const evaluations = await evaluationService.listEvaluationsForInterview(
      companyId,
      req.params.id!,
    );
    res.json(createSuccessResponse(evaluations, 'Evaluations retrieved'));
  });
}

export const evaluationController = new EvaluationController();
