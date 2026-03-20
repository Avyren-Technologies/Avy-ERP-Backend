import { Request, Response } from 'express';
import { attendanceService } from './attendance.service';
import { createSuccessResponse, createPaginatedResponse, getPaginationParams } from '../../../shared/utils';
import { asyncHandler } from '../../../middleware/error.middleware';
import { ApiError } from '../../../shared/errors';
import {
  createAttendanceSchema,
  updateAttendanceSchema,
  attendanceRulesSchema,
  createOverrideSchema,
  approveOverrideSchema,
  createHolidaySchema,
  updateHolidaySchema,
  cloneHolidaysSchema,
  createRosterSchema,
  updateRosterSchema,
  overtimeRulesSchema,
} from './attendance.validators';

export class AttendanceController {
  // ── Attendance Records ──────────────────────────────────────────────

  listRecords = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.employeeId) opts.employeeId = req.query.employeeId as string;
    if (req.query.dateFrom) opts.dateFrom = req.query.dateFrom as string;
    if (req.query.dateTo) opts.dateTo = req.query.dateTo as string;
    if (req.query.status) opts.status = req.query.status as string;
    if (req.query.departmentId) opts.departmentId = req.query.departmentId as string;

    const result = await attendanceService.listRecords(companyId, opts);
    res.json(createPaginatedResponse(result.records, result.page, result.limit, result.total, 'Attendance records retrieved'));
  });

  getRecord = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const record = await attendanceService.getRecord(companyId, req.params.id!);
    res.json(createSuccessResponse(record, 'Attendance record retrieved'));
  });

  createRecord = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const record = await attendanceService.createRecord(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(record, 'Attendance record created'));
  });

  updateRecord = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateAttendanceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const record = await attendanceService.updateRecord(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(record, 'Attendance record updated'));
  });

  getSummary = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const date = req.query.date as string | undefined;
    const summary = await attendanceService.getSummary(companyId, date);
    res.json(createSuccessResponse(summary, 'Attendance summary retrieved'));
  });

  // ── Attendance Rules ────────────────────────────────────────────────

  getRules = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const rules = await attendanceService.getRules(companyId);
    res.json(createSuccessResponse(rules, 'Attendance rules retrieved'));
  });

  updateRules = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = attendanceRulesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const rules = await attendanceService.updateRules(companyId, parsed.data);
    res.json(createSuccessResponse(rules, 'Attendance rules updated'));
  });

  // ── Overrides / Regularization ──────────────────────────────────────

  listOverrides = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.status) opts.status = req.query.status as string;

    const result = await attendanceService.listOverrides(companyId, opts);
    res.json(createPaginatedResponse(result.overrides, result.page, result.limit, result.total, 'Override requests retrieved'));
  });

  createOverride = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = createOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const override = await attendanceService.createOverride(companyId, userId, parsed.data);
    res.status(201).json(createSuccessResponse(override, 'Override request created'));
  });

  processOverride = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const userId = req.user?.id;
    if (!userId) throw ApiError.badRequest('User ID is required');

    const parsed = approveOverrideSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const override = await attendanceService.processOverride(companyId, req.params.id!, userId, parsed.data.status);
    res.json(createSuccessResponse(override, `Override request ${parsed.data.status.toLowerCase()}`));
  });

  // ── Holiday Calendar ────────────────────────────────────────────────

  listHolidays = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const { page, limit } = getPaginationParams(req.query);
    const opts: any = { page, limit };
    if (req.query.year) opts.year = parseInt(req.query.year as string, 10);
    if (req.query.type) opts.type = req.query.type as string;

    const result = await attendanceService.listHolidays(companyId, opts);
    res.json(createPaginatedResponse(result.holidays, result.page, result.limit, result.total, 'Holidays retrieved'));
  });

  createHoliday = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createHolidaySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const holiday = await attendanceService.createHoliday(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(holiday, 'Holiday created'));
  });

  updateHoliday = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateHolidaySchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const holiday = await attendanceService.updateHoliday(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(holiday, 'Holiday updated'));
  });

  deleteHoliday = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await attendanceService.deleteHoliday(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Holiday deleted'));
  });

  cloneHolidays = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = cloneHolidaysSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await attendanceService.cloneHolidays(companyId, parsed.data.fromYear, parsed.data.toYear);
    res.status(201).json(createSuccessResponse(result, `${result.cloned} holidays cloned to ${parsed.data.toYear}`));
  });

  // ── Rosters ─────────────────────────────────────────────────────────

  listRosters = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const rosters = await attendanceService.listRosters(companyId);
    res.json(createSuccessResponse(rosters, 'Rosters retrieved'));
  });

  createRoster = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createRosterSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const roster = await attendanceService.createRoster(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(roster, 'Roster created'));
  });

  updateRoster = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateRosterSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const roster = await attendanceService.updateRoster(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(roster, 'Roster updated'));
  });

  deleteRoster = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await attendanceService.deleteRoster(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Roster deleted'));
  });

  // ── Overtime Rules ──────────────────────────────────────────────────

  getOvertimeRules = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const rules = await attendanceService.getOvertimeRules(companyId);
    res.json(createSuccessResponse(rules, 'Overtime rules retrieved'));
  });

  updateOvertimeRules = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = overtimeRulesSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const rules = await attendanceService.updateOvertimeRules(companyId, parsed.data);
    res.json(createSuccessResponse(rules, 'Overtime rules updated'));
  });
}

export const attendanceController = new AttendanceController();
