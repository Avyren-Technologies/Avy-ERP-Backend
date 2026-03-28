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
  processCompOffSchema,
  createHolidaySchema,
  updateHolidaySchema,
  cloneHolidaysSchema,
  createRosterSchema,
  updateRosterSchema,
  overtimeRulesSchema,
  populateMonthSchema,
  createDeviceSchema,
  updateDeviceSchema,
  syncDeviceSchema,
  createRotationScheduleSchema,
  updateRotationScheduleSchema,
  assignRotationSchema,
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

  // ── Populate Month ─────────────────────────────────────────────────

  populateMonth = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = populateMonthSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await attendanceService.populateMonthAttendance(companyId, parsed.data.month, parsed.data.year);
    res.status(201).json(createSuccessResponse(result, `Month populated: ${result.created} records created`));
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

  // ── Comp-Off Accrual ───────────────────────────────────────────────

  processCompOff = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = processCompOffSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await attendanceService.processCompOffAccrual(companyId, parsed.data.month, parsed.data.year);
    res.json(createSuccessResponse(result, result.message));
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

  // ── Biometric Devices ────────────────────────────────────────────────

  listDevices = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const devices = await attendanceService.listDevices(companyId);
    res.json(createSuccessResponse(devices, 'Biometric devices retrieved'));
  });

  createDevice = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const device = await attendanceService.createDevice(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(device, 'Biometric device created'));
  });

  updateDevice = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const device = await attendanceService.updateDevice(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(device, 'Biometric device updated'));
  });

  deleteDevice = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await attendanceService.deleteDevice(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Biometric device deleted'));
  });

  testDeviceConnection = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await attendanceService.testDeviceConnection(companyId, req.params.id!);
    res.json(createSuccessResponse(result, result.message));
  });

  syncDeviceAttendance = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = syncDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await attendanceService.syncDeviceAttendance(companyId, req.params.id!, parsed.data.records);
    res.status(201).json(createSuccessResponse(result, `Synced ${result.synced}/${result.total} records`));
  });

  // ── Shift Rotation ───────────────────────────────────────────────────

  listRotationSchedules = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const schedules = await attendanceService.listRotationSchedules(companyId);
    res.json(createSuccessResponse(schedules, 'Shift rotation schedules retrieved'));
  });

  createRotationSchedule = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = createRotationScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const schedule = await attendanceService.createRotationSchedule(companyId, parsed.data);
    res.status(201).json(createSuccessResponse(schedule, 'Shift rotation schedule created'));
  });

  updateRotationSchedule = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = updateRotationScheduleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const schedule = await attendanceService.updateRotationSchedule(companyId, req.params.id!, parsed.data);
    res.json(createSuccessResponse(schedule, 'Shift rotation schedule updated'));
  });

  deleteRotationSchedule = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await attendanceService.deleteRotationSchedule(companyId, req.params.id!);
    res.json(createSuccessResponse(result, 'Shift rotation schedule deleted'));
  });

  assignEmployeesToRotation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const parsed = assignRotationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.errors.map((e: any) => e.message).join(', '));
    }

    const result = await attendanceService.assignEmployeesToRotation(companyId, req.params.id!, parsed.data.employeeIds);
    res.json(createSuccessResponse(result, `${result.assigned} employee(s) assigned to rotation`));
  });

  removeEmployeeFromRotation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await attendanceService.removeEmployeeFromRotation(companyId, req.params.id!, req.params.employeeId!);
    res.json(createSuccessResponse(result, 'Employee removed from rotation'));
  });

  executeShiftRotation = asyncHandler(async (req: Request, res: Response) => {
    const companyId = req.user?.companyId;
    if (!companyId) throw ApiError.badRequest('Company ID is required');

    const result = await attendanceService.executeShiftRotation(companyId);
    res.json(createSuccessResponse(result, `Rotation executed: ${result.schedulesProcessed} schedules, ${result.employeesRotated} employees rotated`));
  });
}

export const attendanceController = new AttendanceController();
