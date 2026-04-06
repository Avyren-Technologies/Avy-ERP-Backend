import { Request, Response } from 'express';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { trainingBudgetService } from './training-budget.service';
import { createBudgetSchema, updateBudgetSchema } from './training-budget.validators';

class TrainingBudgetController {
  listBudgets = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.fiscalYear) opts.fiscalYear = req.query.fiscalYear as string;

    const result = await trainingBudgetService.listBudgets(companyId, opts);
    res.json(createPaginatedResponse(result.budgets, result.page, result.limit, result.total, 'Training budgets retrieved'));
  });

  createBudget = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const budget = await trainingBudgetService.createBudget(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(budget, 'Training budget created'));
  });

  updateBudget = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const budget = await trainingBudgetService.updateBudget(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(budget, 'Training budget updated'));
  });

  getUtilization = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const fiscalYear = req.query.fiscalYear as string;
    if (!fiscalYear) throw ApiError.badRequest('Fiscal year query parameter is required');

    const utilization = await trainingBudgetService.getUtilization(companyId, fiscalYear);
    res.json(createSuccessResponse(utilization, 'Budget utilization retrieved'));
  });
}

export const trainingBudgetController = new TrainingBudgetController();
