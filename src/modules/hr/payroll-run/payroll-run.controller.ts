import { Request, Response } from 'express';
import { payrollRunService } from './payroll-run.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createPayrollRunSchema,
  overrideEntrySchema,
  createSalaryHoldSchema,
  createSalaryRevisionSchema,
  createStatutoryFilingSchema,
  updateStatutoryFilingSchema,
} from './payroll-run.validators';

export class PayrollRunController {
  // ══════════════════════════════════════════════════════════════════════════
  // Payroll Runs
  // ══════════════════════════════════════════════════════════════════════════

  listRuns = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.year) opts.year = Number(req.query.year);
    if (req.query.month) opts.month = Number(req.query.month);
    if (req.query.status) opts.status = req.query.status as string;

    const result = await payrollRunService.listRuns(companyId, opts);
    res.json(createPaginatedResponse(result.runs, result.page, result.limit, result.total, 'Payroll runs retrieved'));
  });

  getRun = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const run = await payrollRunService.getRun(companyId, req.params.id!);
    res.json(createSuccessResponse(run, 'Payroll run retrieved'));
  });

  createRun = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createPayrollRunSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const run = await payrollRunService.createRun(companyId, parsed.data.month, parsed.data.year);
    res.status(201).json(createSuccessResponse(run, 'Payroll run created'));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6-Step Wizard
  // ══════════════════════════════════════════════════════════════════════════

  lockAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const result = await payrollRunService.lockAttendance(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(result, 'Attendance locked'));
  });

  reviewExceptions = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollRunService.reviewExceptions(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Exceptions reviewed'));
  });

  computeSalaries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollRunService.computeSalaries(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Salaries computed'));
  });

  computeStatutory = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollRunService.computeStatutory(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Statutory deductions computed'));
  });

  approveRun = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const result = await payrollRunService.approveRun(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(result, 'Payroll run approved'));
  });

  disburseRun = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollRunService.disburseRun(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Payroll run disbursed'));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Payroll Entries
  // ══════════════════════════════════════════════════════════════════════════

  listEntries = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.search) opts.search = req.query.search as string;
    if (req.query.exceptionsOnly === 'true') opts.exceptionsOnly = true;

    const result = await payrollRunService.listEntries(companyId, req.params.id!, opts);
    res.json(createPaginatedResponse(result.entries, result.page, result.limit, result.total, 'Payroll entries retrieved'));
  });

  getEntry = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const entry = await payrollRunService.getEntry(companyId, req.params.id!, req.params.eid!);
    res.json(createSuccessResponse(entry, 'Payroll entry retrieved'));
  });

  overrideEntry = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = overrideEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const entry = await payrollRunService.overrideEntry(companyId, req.params.id!, req.params.eid!, parsed.data);
    res.json(createSuccessResponse(entry, 'Payroll entry overridden'));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Payslips
  // ══════════════════════════════════════════════════════════════════════════

  listPayslips = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.month) opts.month = Number(req.query.month);
    if (req.query.year) opts.year = Number(req.query.year);

    const result = await payrollRunService.listPayslips(companyId, opts);
    res.json(createPaginatedResponse(result.payslips, result.page, result.limit, result.total, 'Payslips retrieved'));
  });

  getPayslip = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const payslip = await payrollRunService.getPayslip(companyId, req.params.id!);
    res.json(createSuccessResponse(payslip, 'Payslip retrieved'));
  });

  generatePayslips = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollRunService.generatePayslips(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Payslips generated'));
  });

  emailPayslip = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await payrollRunService.emailPayslip(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Payslip email sent'));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Salary Holds
  // ══════════════════════════════════════════════════════════════════════════

  listHolds = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.payrollRunId) opts.payrollRunId = req.query.payrollRunId as string;

    const result = await payrollRunService.listHolds(companyId, opts);
    res.json(createPaginatedResponse(result.holds, result.page, result.limit, result.total, 'Salary holds retrieved'));
  });

  createHold = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSalaryHoldSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const hold = await payrollRunService.createHold(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(hold, 'Salary hold created'));
  });

  releaseHold = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const hold = await payrollRunService.releaseHold(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(hold, 'Salary hold released'));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Salary Revisions
  // ══════════════════════════════════════════════════════════════════════════

  listRevisions = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await payrollRunService.listRevisions(companyId, opts);
    res.json(createPaginatedResponse(result.revisions, result.page, result.limit, result.total, 'Salary revisions retrieved'));
  });

  createRevision = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createSalaryRevisionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const revision = await payrollRunService.createRevision(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(revision, 'Salary revision created'));
  });

  getRevision = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const revision = await payrollRunService.getRevision(companyId, req.params.id!);
    res.json(createSuccessResponse(revision, 'Salary revision retrieved'));
  });

  approveRevision = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const revision = await payrollRunService.approveRevision(companyId, req.params.id!, userId);
    res.json(createSuccessResponse(revision, 'Salary revision approved'));
  });

  applyRevision = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const revision = await payrollRunService.applyRevision(companyId, req.params.id!);
    res.json(createSuccessResponse(revision, 'Salary revision applied'));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Arrears
  // ══════════════════════════════════════════════════════════════════════════

  listArrears = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.payrollRunId) opts.payrollRunId = req.query.payrollRunId as string;

    const result = await payrollRunService.listArrears(companyId, opts);
    res.json(createPaginatedResponse(result.arrears, result.page, result.limit, result.total, 'Arrear entries retrieved'));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Statutory Filings
  // ══════════════════════════════════════════════════════════════════════════

  listFilings = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.year) opts.year = Number(req.query.year);
    if (req.query.type) opts.type = req.query.type as string;
    if (req.query.status) opts.status = req.query.status as string;

    const result = await payrollRunService.listFilings(companyId, opts);
    res.json(createPaginatedResponse(result.filings, result.page, result.limit, result.total, 'Statutory filings retrieved'));
  });

  createFiling = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createStatutoryFilingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const filing = await payrollRunService.createFiling(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(filing, 'Statutory filing created'));
  });

  updateFiling = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateStatutoryFilingSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const filing = await payrollRunService.updateFiling(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(filing, 'Statutory filing updated'));
  });

  getStatutoryDashboard = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const dashboard = await payrollRunService.getStatutoryDashboard(companyId);
    res.json(createSuccessResponse(dashboard, 'Statutory dashboard retrieved'));
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Reports
  // ══════════════════════════════════════════════════════════════════════════

  getSalaryRegister = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) throw ApiError.badRequest('month and year query params are required');

    const result = await payrollRunService.getSalaryRegister(companyId, month, year);
    res.json(createSuccessResponse(result, 'Salary register retrieved'));
  });

  getBankFile = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const runId = req.query.runId as string;
    if (!runId) throw ApiError.badRequest('runId query param is required');

    const result = await payrollRunService.getBankFile(companyId, runId);
    res.json(createSuccessResponse(result, 'Bank file data retrieved'));
  });

  getPFECR = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) throw ApiError.badRequest('month and year query params are required');

    const result = await payrollRunService.getPFECR(companyId, month, year);
    res.json(createSuccessResponse(result, 'PF ECR data retrieved'));
  });

  getESIChallan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) throw ApiError.badRequest('month and year query params are required');

    const result = await payrollRunService.getESIChallan(companyId, month, year);
    res.json(createSuccessResponse(result, 'ESI challan data retrieved'));
  });

  getPTChallan = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) throw ApiError.badRequest('month and year query params are required');

    const result = await payrollRunService.getPTChallan(companyId, month, year);
    res.json(createSuccessResponse(result, 'PT challan data retrieved'));
  });

  getVarianceReport = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const month = Number(req.query.month);
    const year = Number(req.query.year);
    if (!month || !year) throw ApiError.badRequest('month and year query params are required');

    const result = await payrollRunService.getVarianceReport(companyId, month, year);
    res.json(createSuccessResponse(result, 'Variance report retrieved'));
  });
}

export const payrollRunController = new PayrollRunController();
