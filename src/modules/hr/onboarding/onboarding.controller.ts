import { Request, Response } from 'express';
import { onboardingService } from './onboarding.service';
import { createSuccessResponse } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createTemplateSchema,
  updateTemplateSchema,
  generateTasksSchema,
  updateTaskSchema,
} from './onboarding.validators';

export class OnboardingController {
  // ── Template CRUD ───────────────────────────────────────────────────

  listTemplates = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const templates = await onboardingService.listTemplates(companyId);
    res.json(createSuccessResponse(templates, 'Onboarding templates retrieved'));
  });

  createTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const template = await onboardingService.createTemplate(companyId, parsed.data as any);
    res.status(201).json(createSuccessResponse(template, 'Onboarding template created'));
  });

  getTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const template = await onboardingService.getTemplate(companyId, req.params.id!);
    res.json(createSuccessResponse(template, 'Onboarding template retrieved'));
  });

  updateTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const template = await onboardingService.updateTemplate(companyId, req.params.id!, parsed.data as any);
    res.json(createSuccessResponse(template, 'Onboarding template updated'));
  });

  deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await onboardingService.deleteTemplate(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Onboarding template deleted'));
  });

  // ── Task Management ─────────────────────────────────────────────────

  generateTasks = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = generateTasksSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const tasks = await onboardingService.generateTasksForEmployee(
      companyId,
      parsed.data.employeeId,
      parsed.data.templateId,
    );
    res.status(201).json(createSuccessResponse(tasks, 'Onboarding tasks generated'));
  });

  listTasks = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.query.employeeId as string | undefined;

    const options: { department?: string; status?: string } = {};
    if (req.query.department) options.department = req.query.department as string;
    if (req.query.status) options.status = req.query.status as string;

    if (employeeId) {
      const tasks = await onboardingService.listTasksForEmployee(companyId, employeeId, options);
      res.json(createSuccessResponse(tasks, 'Onboarding tasks retrieved'));
    } else {
      // No employeeId — list all tasks for the company (for admin overview)
      const allTasks = await onboardingService.listAllTasks(companyId, options);
      res.json(createSuccessResponse(allTasks, 'All onboarding tasks retrieved'));
    }
  });

  updateTask = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e) => e.message).join(', '));
    }

    const task = await onboardingService.updateTask(companyId, req.params.id!, parsed.data as any, req.user?.id);
    res.json(createSuccessResponse(task, 'Onboarding task updated'));
  });

  getProgress = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const progress = await onboardingService.getOnboardingProgress(companyId, req.params.employeeId!);
    res.json(createSuccessResponse(progress, 'Onboarding progress retrieved'));
  });
}

export const onboardingController = new OnboardingController();
