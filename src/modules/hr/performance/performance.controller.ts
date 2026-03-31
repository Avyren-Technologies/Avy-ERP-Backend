import { Request, Response } from 'express';
import { platformPrisma } from '../../../config/database';
import { performanceService } from './performance.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createAppraisalCycleSchema,
  updateAppraisalCycleSchema,
  createGoalSchema,
  updateGoalSchema,
  selfReviewSchema,
  managerReviewSchema,
  publishEntrySchema,
  createFeedback360Schema,
  updateFeedback360Schema,
  createSkillSchema,
  updateSkillSchema,
  createSkillMappingSchema,
  updateSkillMappingSchema,
  createSuccessionPlanSchema,
  updateSuccessionPlanSchema,
} from './performance.validators';

export class PerformanceController {
  // ── Appraisal Cycles ───────────────────────────────────────────────

  listCycles = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const result = await performanceService.listCycles(companyId, { page, limit });
    res.json(createPaginatedResponse(result.cycles, result.page, result.limit, result.total, 'Appraisal cycles retrieved'));
  });

  getCycle = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const cycle = await performanceService.getCycle(companyId, req.params.id!);
    res.json(createSuccessResponse(cycle, 'Appraisal cycle retrieved'));
  });

  createCycle = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createAppraisalCycleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const cycle = await performanceService.createCycle(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(cycle, 'Appraisal cycle created'));
  });

  updateCycle = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateAppraisalCycleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const cycle = await performanceService.updateCycle(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(cycle, 'Appraisal cycle updated'));
  });

  deleteCycle = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await performanceService.deleteCycle(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Appraisal cycle deleted'));
  });

  // ── Cycle Lifecycle ────────────────────────────────────────────────

  activateCycle = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const cycle = await performanceService.activateCycle(companyId, req.params.id!);
    res.json(createSuccessResponse(cycle, 'Appraisal cycle activated'));
  });

  closeReviewWindow = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const cycle = await performanceService.closeReviewWindow(companyId, req.params.id!);
    res.json(createSuccessResponse(cycle, 'Review window closed'));
  });

  startCalibration = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const cycle = await performanceService.startCalibration(companyId, req.params.id!);
    res.json(createSuccessResponse(cycle, 'Calibration started'));
  });

  publishRatings = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const cycle = await performanceService.publishRatings(companyId, req.params.id!);
    res.json(createSuccessResponse(cycle, 'Ratings published'));
  });

  closeCycle = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const cycle = await performanceService.closeCycle(companyId, req.params.id!);
    res.json(createSuccessResponse(cycle, 'Appraisal cycle closed'));
  });

  // ── Goals ──────────────────────────────────────────────────────────

  listGoals = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.cycleId) opts.cycleId = req.query.cycleId as string;
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.departmentId) opts.departmentId = req.query.departmentId as string;
    if (req.query.level) opts.level = req.query.level as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await performanceService.listGoals(companyId, opts);
    res.json(createPaginatedResponse(result.goals, result.page, result.limit, result.total, 'Goals retrieved'));
  });

  getGoal = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const goal = await performanceService.getGoal(companyId, req.params.id!);
    res.json(createSuccessResponse(goal, 'Goal retrieved'));
  });

  createGoal = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createGoalSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const goal = await performanceService.createGoal(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(goal, 'Goal created'));
  });

  updateGoal = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateGoalSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const goal = await performanceService.updateGoal(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(goal, 'Goal updated'));
  });

  deleteGoal = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await performanceService.deleteGoal(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Goal deleted'));
  });

  getGoalCascade = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const departmentId = req.params.departmentId!;
    const cascade = await performanceService.getGoalCascade(companyId, departmentId);
    res.json(createSuccessResponse(cascade, 'Goal cascade retrieved'));
  });

  // ── Appraisal Entries ──────────────────────────────────────────────

  listAllEntries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const where: any = {};
    if (req.query.cycleId) where.cycleId = req.query.cycleId as string;
    if (req.query.status) where.status = (req.query.status as string).toUpperCase();
    if (req.query.employeeId) where.employeeId = req.query.employeeId as string;

    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      platformPrisma.appraisalEntry.findMany({
        where: { ...where, cycle: { companyId } },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          cycle: { select: { id: true, name: true } },
        },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.appraisalEntry.count({ where: { ...where, cycle: { companyId } } }),
    ]);

    res.json(createPaginatedResponse(entries, page, limit, total, 'Appraisal entries retrieved'));
  });

  listEntries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const cycleId = req.params.cycleId!;
    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.departmentId) opts.departmentId = req.query.departmentId as string;

    const result = await performanceService.listEntries(companyId, cycleId, opts);
    res.json(createPaginatedResponse(result.entries, result.page, result.limit, result.total, 'Appraisal entries retrieved'));
  });

  getEntry = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const entry = await performanceService.getEntry(companyId, req.params.id!);
    res.json(createSuccessResponse(entry, 'Appraisal entry retrieved'));
  });

  createEntry = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { cycleId, employeeId } = req.body;
    if (!cycleId || !employeeId) {
      throw ApiError.badRequest('cycleId and employeeId are required');
    }

    const entry = await performanceService.createEntry(companyId, { cycleId, employeeId });
    res.status(201).json(createSuccessResponse(entry, 'Appraisal entry created'));
  });

  selfReview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = selfReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const entry = await performanceService.selfReview(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(entry, 'Self-review submitted'));
  });

  managerReview = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = managerReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const entry = await performanceService.managerReview(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(entry, 'Manager review submitted'));
  });

  publishEntry = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = publishEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const entry = await performanceService.publishEntry(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(entry, 'Appraisal entry published'));
  });

  getCalibrationView = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const cycleId = req.params.cycleId!;
    const { page, limit } = getPaginationParams(req.query);
    const view = await performanceService.getCalibrationView(companyId, cycleId, { page, limit });
    res.json(createSuccessResponse(view, 'Calibration view retrieved'));
  });

  // ── 360 Feedback ───────────────────────────────────────────────────

  listAllFeedback = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const where: any = {};

    // Build filter from query params
    if (req.query.cycleId) where.cycleId = req.query.cycleId as string;
    if (req.query.employeeId) where.employeeId = req.query.employeeId as string;
    if (req.query.status) where.status = (req.query.status as string).toUpperCase();

    const skip = (page - 1) * limit;
    const [feedback, total] = await Promise.all([
      platformPrisma.feedback360.findMany({
        where: { ...where, cycle: { companyId } },
        include: { employee: { select: { id: true, firstName: true, lastName: true } }, rater: { select: { id: true, firstName: true, lastName: true } }, cycle: { select: { id: true, name: true } } },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.feedback360.count({ where: { ...where, cycle: { companyId } } }),
    ]);

    res.json(createPaginatedResponse(feedback, page, limit, total, 'Feedback retrieved'));
  });

  listFeedback = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const cycleId = req.params.cycleId!;
    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;

    const result = await performanceService.listFeedback(companyId, cycleId, opts);
    res.json(createPaginatedResponse(result.feedback, result.page, result.limit, result.total, 'Feedback retrieved'));
  });

  getFeedback = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const feedback = await performanceService.getFeedback(companyId, req.params.id!);
    res.json(createSuccessResponse(feedback, 'Feedback retrieved'));
  });

  createFeedback = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createFeedback360Schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const feedback = await performanceService.createFeedback(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(feedback, 'Feedback created'));
  });

  updateFeedback = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateFeedback360Schema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const feedback = await performanceService.updateFeedback(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(feedback, 'Feedback updated'));
  });

  deleteFeedback = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await performanceService.deleteFeedback(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Feedback deleted'));
  });

  submitFeedback = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const feedback = await performanceService.submitFeedback(companyId, req.params.id!);
    res.json(createSuccessResponse(feedback, 'Feedback submitted'));
  });

  getAggregatedFeedbackReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.params.employeeId!;
    const cycleId = req.params.cycleId!;

    const report = await performanceService.getAggregatedFeedbackReport(companyId, employeeId, cycleId);
    res.json(createSuccessResponse(report, 'Aggregated feedback report retrieved'));
  });

  // ── Skills ─────────────────────────────────────────────────────────

  listSkills = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const result = await performanceService.listSkills(companyId, { page, limit });
    res.json(createPaginatedResponse(result.skills, result.page, result.limit, result.total, 'Skills retrieved'));
  });

  getSkill = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const skill = await performanceService.getSkill(companyId, req.params.id!);
    res.json(createSuccessResponse(skill, 'Skill retrieved'));
  });

  createSkill = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const skill = await performanceService.createSkill(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(skill, 'Skill created'));
  });

  updateSkill = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSkillSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const skill = await performanceService.updateSkill(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(skill, 'Skill updated'));
  });

  deleteSkill = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await performanceService.deleteSkill(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Skill deleted'));
  });

  // ── Skill Mappings ─────────────────────────────────────────────────

  listSkillMappings = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.category) opts.category = req.query.category as string;

    const result = await performanceService.listSkillMappings(companyId, opts);
    res.json(createPaginatedResponse(result.mappings, result.page, result.limit, result.total, 'Skill mappings retrieved'));
  });

  getSkillMapping = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const mapping = await performanceService.getSkillMapping(companyId, req.params.id!);
    res.json(createSuccessResponse(mapping, 'Skill mapping retrieved'));
  });

  createSkillMapping = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSkillMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const mapping = await performanceService.createSkillMapping(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(mapping, 'Skill mapping created'));
  });

  updateSkillMapping = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSkillMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const mapping = await performanceService.updateSkillMapping(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(mapping, 'Skill mapping updated'));
  });

  deleteSkillMapping = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await performanceService.deleteSkillMapping(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Skill mapping deleted'));
  });

  getGapAnalysis = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const employeeId = req.params.employeeId!;
    const analysis = await performanceService.getGapAnalysis(companyId, employeeId);
    res.json(createSuccessResponse(analysis, 'Gap analysis retrieved'));
  });

  // ── Succession Plans ───────────────────────────────────────────────

  listSuccessionPlans = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.readiness) opts.readiness = req.query.readiness as string;

    const result = await performanceService.listSuccessionPlans(companyId, opts);
    res.json(createPaginatedResponse(result.plans, result.page, result.limit, result.total, 'Succession plans retrieved'));
  });

  getSuccessionPlan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const plan = await performanceService.getSuccessionPlan(companyId, req.params.id!);
    res.json(createSuccessResponse(plan, 'Succession plan retrieved'));
  });

  createSuccessionPlan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSuccessionPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const plan = await performanceService.createSuccessionPlan(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(plan, 'Succession plan created'));
  });

  updateSuccessionPlan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSuccessionPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const plan = await performanceService.updateSuccessionPlan(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(plan, 'Succession plan updated'));
  });

  deleteSuccessionPlan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await performanceService.deleteSuccessionPlan(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Succession plan deleted'));
  });

  getNineBox = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const grid = await performanceService.getNineBox(companyId);
    res.json(createSuccessResponse(grid, '9-box grid retrieved'));
  });

  getBenchStrength = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const strength = await performanceService.getBenchStrength(companyId);
    res.json(createSuccessResponse(strength, 'Bench strength retrieved'));
  });

  // ── Dashboard ──────────────────────────────────────────────────────

  getDashboard = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const dashboard = await performanceService.getPerformanceDashboard(companyId);
    res.json(createSuccessResponse(dashboard, 'Performance dashboard retrieved'));
  });
}

export const performanceController = new PerformanceController();
