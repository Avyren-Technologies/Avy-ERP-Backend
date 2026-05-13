import { Request, Response } from 'express';
import { pipService } from './pip.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createSlabConfigSchema,
  bulkCreateSlabConfigSchema,
  updateSlabConfigSchema,
  saveDailyEntriesSchema,
  simulateIncentiveSchema,
  updateIncentiveConfigSchema,
  generateMonthlyReportSchema,
  mergeToPayrollSchema,
  listSlabConfigsSchema,
  listDailyEntriesSchema,
  listMonthlyReportsSchema,
} from './pip.validators';

export class PipController {
  // ── Incentive Config ──────────────────────────────────────────────

  getIncentiveConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await pipService.getIncentiveConfig(companyId);
    res.json(createSuccessResponse(config, 'Incentive config retrieved'));
  });

  updateIncentiveConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateIncentiveConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await pipService.updateIncentiveConfig(companyId, parsed.data, userId);
    res.json(createSuccessResponse(config, 'Incentive config updated'));
  });

  // ── Slab Configs ──────────────────────────────────────────────────

  listSlabConfigs = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = listSlabConfigsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { page, limit } = getPaginationParams(req.query);
    const result = await pipService.listSlabConfigs(companyId, {
      page,
      limit,
      search: parsed.data.search,
      machineId: parsed.data.machineId,
      partId: parsed.data.partId,
      locationId: parsed.data.locationId,
      isActive: parsed.data.isActive,
    });

    res.json(createPaginatedResponse(result.configs, result.page, result.limit, result.total, 'Slab configs retrieved'));
  });

  getSlabConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const config = await pipService.getSlabConfig(companyId, req.params.id!);
    res.json(createSuccessResponse(config, 'Slab config retrieved'));
  });

  createSlabConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSlabConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await pipService.createSlabConfig(companyId, parsed.data, userId);
    res.status(201).json(createSuccessResponse(config, 'Slab config created'));
  });

  bulkCreateSlabConfigs = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = bulkCreateSlabConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await pipService.bulkCreateSlabConfigs(companyId, parsed.data, userId);
    res.status(201).json(createSuccessResponse(result, 'Bulk slab configs created'));
  });

  updateSlabConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateSlabConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const config = await pipService.updateSlabConfig(companyId, req.params.id!, parsed.data, userId);
    res.json(createSuccessResponse(config, 'Slab config updated'));
  });

  deleteSlabConfig = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const result = await pipService.deleteSlabConfig(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(result, 'Slab config deleted'));
  });

  // ── Daily Entries ─────────────────────────────────────────────────

  saveDailyEntries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = saveDailyEntriesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await pipService.saveDailyEntries(companyId, parsed.data, userId);
    res.status(201).json(createSuccessResponse(result, 'Daily entries saved'));
  });

  listDailyEntries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = listDailyEntriesSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { page, limit } = getPaginationParams(req.query);
    const result = await pipService.listDailyEntries(companyId, {
      page,
      limit,
      entryDate: parsed.data.entryDate,
      shiftId: parsed.data.shiftId,
      operatorId: parsed.data.operatorId,
      machineId: parsed.data.machineId,
      partId: parsed.data.partId,
      status: parsed.data.status,
      locationId: parsed.data.locationId,
    });

    res.json(createPaginatedResponse(result.entries, result.page, result.limit, result.total, 'Daily entries retrieved'));
  });

  getDailyEntrySummary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = listDailyEntriesSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { page, limit } = getPaginationParams(req.query);
    const summary = await pipService.getDailyEntrySummary(companyId, {
      page,
      limit,
      entryDate: parsed.data.entryDate,
      shiftId: parsed.data.shiftId,
      operatorId: parsed.data.operatorId,
      locationId: parsed.data.locationId,
      status: parsed.data.status,
    });

    res.json(createSuccessResponse(summary, 'Daily entry summary retrieved'));
  });

  deleteDailyEntries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const result = await pipService.deleteDailyEntries(companyId, req.params.sessionRef!, userId);
    res.json(createSuccessResponse(result, 'Daily entries deleted'));
  });

  // ── Calculator ────────────────────────────────────────────────────

  simulateIncentive = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = simulateIncentiveSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await pipService.simulateIncentive(companyId, parsed.data);
    res.json(createSuccessResponse(result, 'Incentive simulation completed'));
  });

  // ── Dashboard ─────────────────────────────────────────────────────

  getDashboardMetrics = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const locationId = req.query.locationId as string | undefined;
    const metrics = await pipService.getDashboardMetrics(companyId, locationId);
    res.json(createSuccessResponse(metrics, 'Dashboard metrics retrieved'));
  });

  // ── Monthly Reports ───────────────────────────────────────────────

  generateMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = generateMonthlyReportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const report = await pipService.generateMonthlyReport(companyId, parsed.data, userId);
    res.status(201).json(createSuccessResponse(report, 'Monthly report generated'));
  });

  listMonthlyReports = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = listMonthlyReportsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { page, limit } = getPaginationParams(req.query);
    const result = await pipService.listMonthlyReports(companyId, {
      page,
      limit,
      status: parsed.data.status,
      locationId: parsed.data.locationId,
      year: parsed.data.year,
    });

    res.json(createPaginatedResponse(result.reports, result.page, result.limit, result.total, 'Monthly reports retrieved'));
  });

  getMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const report = await pipService.getMonthlyReport(companyId, req.params.id!);
    res.json(createSuccessResponse(report, 'Monthly report retrieved'));
  });

  submitMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const report = await pipService.submitMonthlyReport(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(report, 'Monthly report submitted'));
  });

  approveMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const report = await pipService.approveMonthlyReport(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(report, 'Monthly report approved'));
  });

  rejectMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const { reason } = req.body;
    const report = await pipService.rejectMonthlyReport(companyId, req.params.id!, userId, reason);
    res.json(createSuccessResponse(report, 'Monthly report rejected'));
  });

  mergeToPayroll = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = mergeToPayrollSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await pipService.mergeToPayroll(companyId, req.params.id!, parsed.data.payrollRunId, userId);
    res.json(createSuccessResponse(result, 'PIP incentives merged to payroll'));
  });

  previewPayrollMerge = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const preview = await pipService.previewPayrollMerge(companyId, req.params.id!);
    res.json(createSuccessResponse(preview, 'Payroll merge preview retrieved'));
  });

  reversePayrollMerge = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const result = await pipService.reversePayrollMerge(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(result, 'Payroll merge reversed'));
  });

  // ── Export (returns summary data — frontend renders PDF/Excel) ────

  exportDailyReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = listDailyEntriesSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { page, limit } = getPaginationParams(req.query);
    const summary = await pipService.getDailyEntrySummary(companyId, {
      page,
      limit,
      entryDate: parsed.data.entryDate,
      shiftId: parsed.data.shiftId,
      operatorId: parsed.data.operatorId,
      locationId: parsed.data.locationId,
      status: parsed.data.status,
    });

    res.json(createSuccessResponse(summary, 'Daily report export data'));
  });

  exportMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const year = parseInt(req.query.year as string, 10);
    if (!year) throw ApiError.badRequest('Year is required');

    const reports = await pipService.listMonthlyReports(companyId, { year, page: 1, limit: 12 });
    res.json(createSuccessResponse(reports, 'Monthly report export data'));
  });
}

export const pipController = new PipController();
