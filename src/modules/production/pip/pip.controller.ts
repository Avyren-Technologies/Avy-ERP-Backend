import { Request, Response } from 'express';
import { pipService } from './pip.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import { platformPrisma } from '../../../config/database';
import { generateExcelReport } from '../../hr/analytics/exports/excel-exporter';
import { exportToPDF } from '../../hr/analytics/exports/pdf-exporter';
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
  createOperationSchema,
  updateOperationSchema,
  listOperationsSchema,
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

  // ── Operations ────────────────────────────────────────────────────

  listOperations = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = listOperationsSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const { page, limit } = getPaginationParams(req.query);
    const result = await pipService.listOperations(companyId, {
      page,
      limit,
      search: parsed.data.search,
      processType: parsed.data.processType,
      status: parsed.data.status,
    });

    res.json(createPaginatedResponse(result.operations, result.page, result.limit, result.total, 'Operations retrieved'));
  });

  getOperation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const operation = await pipService.getOperation(companyId, req.params.id!);
    res.json(createSuccessResponse(operation, 'Operation retrieved'));
  });

  createOperation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = createOperationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const operation = await pipService.createOperation(companyId, parsed.data, userId);
    res.status(201).json(createSuccessResponse(operation, 'Operation created'));
  });

  updateOperation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateOperationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const operation = await pipService.updateOperation(companyId, req.params.id!, parsed.data, userId);
    res.json(createSuccessResponse(operation, 'Operation updated'));
  });

  deleteOperation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    const userId = req.user?.id;
    if (!companyId || !userId) throw ApiError.badRequest('Company ID is required');

    const result = await pipService.deleteOperation(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(result, 'Operation deleted'));
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
      operationId: parsed.data.operationId,
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

  // ── Export (generates actual PDF/Excel binary files) ────

  exportDailyReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const format = (req.query.format as string) || 'excel';
    if (!['pdf', 'excel'].includes(format)) {
      throw ApiError.badRequest('Format must be "pdf" or "excel"');
    }

    const parsed = listDailyEntriesSchema.safeParse(req.query);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const summary = await pipService.getDailyEntrySummary(companyId, {
      page: 1,
      limit: 10000,
      entryDate: parsed.data.entryDate,
      shiftId: parsed.data.shiftId,
      operatorId: parsed.data.operatorId,
      locationId: parsed.data.locationId,
      status: parsed.data.status,
    });

    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const companyName = company?.name ?? 'Company';
    const entryDate = parsed.data.entryDate ?? new Date().toISOString().slice(0, 10);

    // Flatten operator summaries into export rows
    const rows = summary.operators.map((op) => ({
      operatorName: op.operatorName,
      employeeId: op.employeeId,
      entryCount: op.entryCount,
      totalQtyProduced: op.totalQtyProduced,
      totalIncentive: op.totalIncentive,
    }));

    const columns = [
      { header: 'Operator', key: 'operatorName', width: 25, format: 'text' as const },
      { header: 'Employee ID', key: 'employeeId', width: 18, format: 'text' as const },
      { header: 'Entries', key: 'entryCount', width: 12, format: 'number' as const },
      { header: 'Total Qty Produced', key: 'totalQtyProduced', width: 20, format: 'number' as const },
      { header: 'Incentive (₹)', key: 'totalIncentive', width: 18, format: 'currency' as const },
    ];

    const totalsRow: Record<string, unknown> = {
      operatorName: 'TOTAL',
      employeeId: '',
      entryCount: summary.totalEntries,
      totalQtyProduced: summary.grandTotalQty,
      totalIncentive: summary.grandTotalIncentive,
    };

    if (format === 'excel') {
      const buffer = await generateExcelReport({
        companyName,
        reportTitle: 'Daily Production Report (PIP)',
        period: entryDate,
        sheets: [{
          name: 'Daily Report',
          columns,
          rows,
          totalsRow,
          freezeRow: 6,
        }],
      });

      const filename = `daily-report-${entryDate}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } else {
      const buffer = await exportToPDF(
        `${companyName} — Daily Production Report (PIP) — ${entryDate}`,
        columns,
        rows,
      );

      const filename = `daily-report-${entryDate}.pdf`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename.replace('.pdf', '.csv')}"`);
      res.send(buffer);
    }
  });

  exportMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const format = (req.query.format as string) || 'excel';
    if (!['pdf', 'excel'].includes(format)) {
      throw ApiError.badRequest('Format must be "pdf" or "excel"');
    }

    const year = parseInt(req.query.year as string, 10);
    if (!year) throw ApiError.badRequest('Year is required');

    const reports = await pipService.listMonthlyReports(companyId, { year, page: 1, limit: 12 });

    const company = await platformPrisma.company.findUnique({
      where: { id: companyId },
      select: { name: true },
    });
    const companyName = company?.name ?? 'Company';

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const rows = (reports.reports ?? []).map((r: any) => ({
      month: monthNames[r.month - 1] ?? `Month ${r.month}`,
      operatorCount: r.operatorCount ?? 0,
      totalQtyProduced: r.totalQtyProduced ?? 0,
      totalIncentive: Number(r.totalIncentive ?? 0),
      status: r.status ?? 'DRAFT',
    }));

    const columns = [
      { header: 'Month', key: 'month', width: 15, format: 'text' as const },
      { header: 'Operators', key: 'operatorCount', width: 14, format: 'number' as const },
      { header: 'Total Qty', key: 'totalQtyProduced', width: 16, format: 'number' as const },
      { header: 'Total Incentive (₹)', key: 'totalIncentive', width: 20, format: 'currency' as const },
      { header: 'Status', key: 'status', width: 15, format: 'text' as const, conditionalFormat: 'status' as const },
    ];

    if (format === 'excel') {
      const buffer = await generateExcelReport({
        companyName,
        reportTitle: 'Monthly Production Report (PIP)',
        period: `Year ${year}`,
        sheets: [{
          name: 'Monthly Report',
          columns,
          rows,
          freezeRow: 6,
        }],
      });

      const filename = `monthly-report-${year}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } else {
      const buffer = await exportToPDF(
        `${companyName} — Monthly Production Report (PIP) — Year ${year}`,
        columns,
        rows,
      );

      const filename = `monthly-report-${year}.csv`;
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    }
  });
}

export const pipController = new PipController();
