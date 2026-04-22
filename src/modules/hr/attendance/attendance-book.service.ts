import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { getCachedAttendanceRules, getCachedCompanySettings } from '../../../shared/utils/config-cache';
import { resolvePolicy, type EvaluationContext } from '../../../shared/services/policy-resolver.service';
import {
  resolveAttendanceStatus,
  deriveStatusFromHalves,
  type AttendanceRulesInput,
  type ShiftInfo,
} from '../../../shared/services/attendance-status-resolver.service';
import { nowInCompanyTimezone, parseInCompanyTimezone } from '../../../shared/utils/timezone';
import { auditLog } from '../../../shared/utils/audit';
import { logger } from '../../../config/logger';
import { DateTime } from 'luxon';
import type { BookFetchInput, BookMarkInput, BookSaveAllInput } from './attendance-book.validators';
import type { Prisma } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────────────

type HalfInput = { status: 'PRESENT' | 'ABSENT' | 'ON_LEAVE'; leaveTypeId?: string };

interface LeaveHandleResult {
  firstHalfLeaveRequestId: string | null;
  secondHalfLeaveRequestId: string | null;
}

// ─── Service ────────────────────────────────────────────────────────────────

class AttendanceBookService {
  // ══════════════════════════════════════════════════════════════════════════
  //  1. fetchBook — Paginated employee list with existing attendance + leave
  // ══════════════════════════════════════════════════════════════════════════

  async fetchBook(companyId: string, input: BookFetchInput) {
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const today = nowInCompanyTimezone(companyTimezone).toFormat('yyyy-MM-dd');

    // Validate date <= today
    if (input.date > today) {
      throw ApiError.badRequest('Cannot fetch attendance book for a future date');
    }

    const dateAsUtc = new Date(input.date + 'T00:00:00.000Z');
    const year = parseInt(input.date.substring(0, 4), 10);

    // ── Build employee filter ──
    const where: Prisma.EmployeeWhereInput = {
      companyId,
      status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_NOTICE'] },
    };

    if (input.shiftId) where.shiftId = input.shiftId;
    if (input.departmentId) where.departmentId = input.departmentId;
    if (input.designationId) where.designationId = input.designationId;
    if (input.search) {
      where.OR = [
        { firstName: { contains: input.search, mode: 'insensitive' } },
        { lastName: { contains: input.search, mode: 'insensitive' } },
        { employeeId: { contains: input.search, mode: 'insensitive' } },
      ];
    }

    const offset = (input.page - 1) * input.limit;

    // ── Get paginated employees ──
    const [employees, total] = await Promise.all([
      platformPrisma.employee.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeId: true,
          profilePhotoUrl: true,
          shiftId: true,
          department: { select: { id: true, name: true } },
          designation: { select: { id: true, name: true } },
          shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        },
        skip: offset,
        take: input.limit,
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
      platformPrisma.employee.count({ where }),
    ]);

    if (employees.length === 0) {
      return {
        data: [],
        meta: { page: input.page, limit: input.limit, total, totalPages: Math.ceil(total / input.limit) },
      };
    }

    const employeeIds = employees.map((e) => e.id);

    // ── Batch-fetch related data for all employees on this page ──
    const [attendanceRecords, leaveRequests, leaveBalances, leaveTypes] = await Promise.all([
      // Attendance records for this date (shiftSequence = 1) with halves
      platformPrisma.attendanceRecord.findMany({
        where: { employeeId: { in: employeeIds }, date: dateAsUtc, shiftSequence: 1 },
        include: {
          halves: {
            include: { leaveType: { select: { id: true, name: true, code: true } } },
          },
        },
      }),
      // Leave requests overlapping this date
      platformPrisma.leaveRequest.findMany({
        where: {
          employeeId: { in: employeeIds },
          fromDate: { lte: dateAsUtc },
          toDate: { gte: dateAsUtc },
          status: { in: ['APPROVED', 'AUTO_APPROVED'] },
        },
        include: { leaveType: { select: { id: true, name: true, code: true } } },
      }),
      // Leave balances for the year
      platformPrisma.leaveBalance.findMany({
        where: { employeeId: { in: employeeIds }, year },
        include: { leaveType: { select: { id: true, name: true, code: true } } },
      }),
      // All active leave types for the company
      platformPrisma.leaveType.findMany({
        where: { companyId, isActive: true },
        select: { id: true, name: true, code: true, category: true, allowHalfDay: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    // ── Index data by employee ──
    const recordMap = new Map<string, (typeof attendanceRecords)[0]>();
    for (const rec of attendanceRecords) {
      recordMap.set(rec.employeeId, rec);
    }

    const leaveMap = new Map<string, (typeof leaveRequests)[0][]>();
    for (const lr of leaveRequests) {
      const arr = leaveMap.get(lr.employeeId) ?? [];
      arr.push(lr);
      leaveMap.set(lr.employeeId, arr);
    }

    const balanceMap = new Map<string, (typeof leaveBalances)[0][]>();
    for (const lb of leaveBalances) {
      const arr = balanceMap.get(lb.employeeId) ?? [];
      arr.push(lb);
      balanceMap.set(lb.employeeId, arr);
    }

    // ── Build response per employee ──
    const data = employees.map((emp) => {
      const record = recordMap.get(emp.id) ?? null;
      const empLeaves = leaveMap.get(emp.id) ?? [];
      const empBalances = balanceMap.get(emp.id) ?? [];

      return {
        employeeId: emp.id,
        employeeName: [emp.firstName, emp.lastName].filter(Boolean).join(' '),
        employeeCode: emp.employeeId,
        profilePhotoUrl: emp.profilePhotoUrl,
        department: emp.department ? { id: emp.department.id, name: emp.department.name } : null,
        designation: emp.designation ? { id: emp.designation.id, name: emp.designation.name } : null,
        shift: emp.shift
          ? { id: emp.shift.id, name: emp.shift.name, startTime: emp.shift.startTime, endTime: emp.shift.endTime }
          : null,
        existingRecord: record
          ? {
              id: record.id,
              status: record.status,
              source: record.source,
              punchIn: record.punchIn,
              punchOut: record.punchOut,
              workedHours: record.workedHours ? Number(record.workedHours) : null,
              remarks: record.remarks,
              updatedAt: record.updatedAt.toISOString(),
              isLocked: record.source !== 'HR_BOOK',
              halves: record.halves.map((h) => ({
                id: h.id,
                half: h.half,
                status: h.status,
                leaveTypeId: h.leaveTypeId,
                leaveTypeName: h.leaveType?.name ?? null,
                leaveRequestId: h.leaveRequestId,
                overrideTime: h.overrideTime,
                remarks: h.remarks,
              })),
            }
          : null,
        existingLeave: empLeaves.map((lr) => ({
          id: lr.id,
          leaveTypeId: lr.leaveTypeId,
          leaveTypeName: lr.leaveType?.name ?? null,
          leaveTypeCode: lr.leaveType?.code ?? null,
          fromDate: lr.fromDate,
          toDate: lr.toDate,
          days: Number(lr.days),
          isHalfDay: lr.isHalfDay,
          halfDayType: lr.halfDayType,
          status: lr.status,
        })),
        leaveBalances: empBalances.map((lb) => ({
          leaveTypeId: lb.leaveTypeId,
          leaveTypeName: lb.leaveType?.name ?? null,
          leaveTypeCode: lb.leaveType?.code ?? null,
          balance: Number(lb.balance),
          taken: Number(lb.taken),
        })),
      };
    });

    return {
      data,
      leaveTypes,
      meta: {
        page: input.page,
        limit: input.limit,
        total,
        totalPages: Math.ceil(total / input.limit),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  2. markAttendance — Mark a single employee's half-day attendance
  // ══════════════════════════════════════════════════════════════════════════

  async markAttendance(companyId: string, input: BookMarkInput, userId: string) {
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const today = nowInCompanyTimezone(companyTimezone).toFormat('yyyy-MM-dd');

    // Step 1: Validate date <= today
    if (input.date > today) {
      throw ApiError.badRequest('Cannot mark attendance for a future date');
    }

    const dateAsUtc = new Date(input.date + 'T00:00:00.000Z');
    const year = parseInt(input.date.substring(0, 4), 10);

    // Step 2: Verify employee exists
    const employee = await platformPrisma.employee.findUnique({
      where: { id: input.employeeId, companyId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
        shiftId: true,
        locationId: true,
      },
    });
    if (!employee) {
      throw ApiError.notFound('Employee not found');
    }

    // Step 3: Get shift info
    let shiftInfo: ShiftInfo | null = null;
    let shiftStartTime: string | null = null;
    let shiftEndTime: string | null = null;
    let shiftIsCrossDay = false;

    if (employee.shiftId) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: employee.shiftId },
        select: { startTime: true, endTime: true, isCrossDay: true, name: true },
      });
      if (shift) {
        shiftInfo = {
          startTime: shift.startTime,
          endTime: shift.endTime,
          isCrossDay: shift.isCrossDay,
        };
        shiftStartTime = shift.startTime;
        shiftEndTime = shift.endTime;
        shiftIsCrossDay = shift.isCrossDay;
      }
    }

    // Step 4: Find existing record
    const existingRecord = await platformPrisma.attendanceRecord.findUnique({
      where: {
        employeeId_date_shiftSequence: {
          employeeId: input.employeeId,
          date: dateAsUtc,
          shiftSequence: 1,
        },
      },
      include: {
        halves: true,
      },
    });

    // Step 5: Optimistic lock check
    if (input.existingRecordUpdatedAt && existingRecord) {
      const clientUpdatedAt = new Date(input.existingRecordUpdatedAt).getTime();
      const serverUpdatedAt = existingRecord.updatedAt.getTime();
      if (clientUpdatedAt !== serverUpdatedAt) {
        throw ApiError.conflict(
          'This attendance record has been modified by another user. Please refresh and try again.',
        );
      }
    }

    // Step 6: Override check
    if (existingRecord && existingRecord.source !== 'HR_BOOK' && !input.forceOverride) {
      throw ApiError.conflict(
        `This record was created via ${existingRecord.source}. Set forceOverride to true to override.`,
      );
    }

    // Step 7: Handle leave for halves
    const leaveResult = await this.handleLeaveForHalves({
      companyId,
      employeeId: input.employeeId,
      date: input.date,
      dateAsUtc,
      year,
      firstHalf: input.firstHalf as HalfInput,
      secondHalf: input.secondHalf as HalfInput,
      existingHalves: existingRecord?.halves ?? [],
      forceOverride: input.forceOverride ?? false,
      userId,
    });

    // Step 8: Determine punch times
    let punchIn: Date | null = null;
    let punchOut: Date | null = null;
    const anyPresent =
      input.firstHalf.status === 'PRESENT' || input.secondHalf.status === 'PRESENT';

    if (anyPresent && shiftStartTime && shiftEndTime) {
      if (input.punchInOverride) {
        const dt = parseInCompanyTimezone(input.date, input.punchInOverride, companyTimezone);
        punchIn = dt.toJSDate();
      } else {
        const dt = parseInCompanyTimezone(input.date, shiftStartTime, companyTimezone);
        punchIn = dt.toJSDate();
      }

      if (input.punchOutOverride) {
        let dt = parseInCompanyTimezone(input.date, input.punchOutOverride, companyTimezone);
        if (shiftIsCrossDay) dt = dt.plus({ days: 1 });
        punchOut = dt.toJSDate();
      } else {
        let dt = parseInCompanyTimezone(input.date, shiftEndTime, companyTimezone);
        if (shiftIsCrossDay) dt = dt.plus({ days: 1 });
        punchOut = dt.toJSDate();
      }
    }

    // Step 9: Derive overall status from halves
    const derivedStatus = deriveStatusFromHalves(
      input.firstHalf.status as 'PRESENT' | 'ABSENT' | 'ON_LEAVE',
      input.secondHalf.status as 'PRESENT' | 'ABSENT' | 'ON_LEAVE',
    );

    // Step 10: If any half is PRESENT, run resolveAttendanceStatus for details
    let statusResult: {
      status: string;
      finalStatusReason: string;
      isLate: boolean;
      lateMinutes: number;
      isEarlyExit: boolean;
      earlyMinutes: number;
      workedHours: number;
      overtimeHours: number;
      appliedLateDeduction: number | null;
      appliedEarlyExitDeduction: number | null;
    } | null = null;

    if (anyPresent && punchIn && punchOut) {
      try {
        const rules = await getCachedAttendanceRules(companyId);
        const evalContext: EvaluationContext = await this.buildEvaluationContext(
          companyId,
          input.employeeId,
          employee.shiftId,
          employee.locationId,
          dateAsUtc,
          companyTimezone,
        );
        const policyResult = await resolvePolicy(companyId, evalContext);

        const rulesInput: AttendanceRulesInput = {
          lopAutoDeduct: rules.lopAutoDeduct,
          autoMarkAbsentIfNoPunch: rules.autoMarkAbsentIfNoPunch,
          autoHalfDayEnabled: rules.autoHalfDayEnabled,
          lateDeductionType: rules.lateDeductionType,
          lateDeductionValue: rules.lateDeductionValue ? Number(rules.lateDeductionValue) : null,
          earlyExitDeductionType: rules.earlyExitDeductionType,
          earlyExitDeductionValue: rules.earlyExitDeductionValue
            ? Number(rules.earlyExitDeductionValue)
            : null,
          ignoreLateOnLeaveDay: rules.ignoreLateOnLeaveDay,
          ignoreLateOnHoliday: rules.ignoreLateOnHoliday,
          ignoreLateOnWeekOff: rules.ignoreLateOnWeekOff,
        };

        statusResult = resolveAttendanceStatus(
          punchIn,
          punchOut,
          shiftInfo,
          policyResult.policy,
          evalContext,
          rulesInput,
          companyTimezone,
        );
      } catch (err) {
        // Fallback: use derived status
        logger.warn(
          `Attendance status resolution failed for employee ${input.employeeId} on ${input.date}, using derived status: ${derivedStatus}`,
          err,
        );
      }
    }

    // Compute the final status: use derived half-based status (it accurately captures half-day semantics)
    // but enrich with worked hours / late / early from the resolution result
    const finalStatus = derivedStatus;
    const finalWorkedHours = statusResult?.workedHours ?? null;

    // Step 11: Upsert AttendanceRecord
    const isOverriding = existingRecord != null && existingRecord.source !== 'HR_BOOK';
    const recordData = {
      status: finalStatus as any,
      source: 'HR_BOOK' as const,
      punchIn,
      punchOut,
      workedHours: finalWorkedHours,
      isLate: statusResult?.isLate ?? false,
      lateMinutes: statusResult?.lateMinutes ?? null,
      isEarlyExit: statusResult?.isEarlyExit ?? false,
      earlyMinutes: statusResult?.earlyMinutes ?? null,
      overtimeHours: statusResult?.overtimeHours ?? null,
      remarks: input.remarks ?? null,
      shiftId: employee.shiftId,
      locationId: employee.locationId,
      finalStatusReason: statusResult?.finalStatusReason ?? `HR Book: ${finalStatus}`,
      appliedLateDeduction: statusResult?.appliedLateDeduction ?? null,
      appliedEarlyExitDeduction: statusResult?.appliedEarlyExitDeduction ?? null,
      ...(isOverriding
        ? {
            isOverridden: true,
            overriddenBy: userId,
            overriddenAt: new Date(),
            previousSource: existingRecord!.source,
          }
        : {}),
    };

    const upsertedRecord = await platformPrisma.attendanceRecord.upsert({
      where: {
        employeeId_date_shiftSequence: {
          employeeId: input.employeeId,
          date: dateAsUtc,
          shiftSequence: 1,
        },
      },
      create: {
        employeeId: input.employeeId,
        companyId,
        date: dateAsUtc,
        shiftSequence: 1,
        ...recordData,
      },
      update: recordData,
    });

    // Step 12: Upsert two AttendanceHalf entries
    await Promise.all([
      platformPrisma.attendanceHalf.upsert({
        where: {
          attendanceRecordId_half: {
            attendanceRecordId: upsertedRecord.id,
            half: 'FIRST_HALF',
          },
        },
        create: {
          attendanceRecordId: upsertedRecord.id,
          half: 'FIRST_HALF',
          status: input.firstHalf.status as any,
          leaveTypeId: input.firstHalf.status === 'ON_LEAVE' ? (input.firstHalf.leaveTypeId ?? null) : null,
          leaveRequestId: leaveResult.firstHalfLeaveRequestId,
          overrideTime: input.punchInOverride ?? null,
          remarks: input.remarks ?? null,
          markedBy: userId,
        },
        update: {
          status: input.firstHalf.status as any,
          leaveTypeId: input.firstHalf.status === 'ON_LEAVE' ? (input.firstHalf.leaveTypeId ?? null) : null,
          leaveRequestId: leaveResult.firstHalfLeaveRequestId,
          overrideTime: input.punchInOverride ?? null,
          remarks: input.remarks ?? null,
          markedBy: userId,
          markedAt: new Date(),
        },
      }),
      platformPrisma.attendanceHalf.upsert({
        where: {
          attendanceRecordId_half: {
            attendanceRecordId: upsertedRecord.id,
            half: 'SECOND_HALF',
          },
        },
        create: {
          attendanceRecordId: upsertedRecord.id,
          half: 'SECOND_HALF',
          status: input.secondHalf.status as any,
          leaveTypeId: input.secondHalf.status === 'ON_LEAVE' ? (input.secondHalf.leaveTypeId ?? null) : null,
          leaveRequestId: leaveResult.secondHalfLeaveRequestId,
          overrideTime: input.punchOutOverride ?? null,
          remarks: input.remarks ?? null,
          markedBy: userId,
        },
        update: {
          status: input.secondHalf.status as any,
          leaveTypeId: input.secondHalf.status === 'ON_LEAVE' ? (input.secondHalf.leaveTypeId ?? null) : null,
          leaveRequestId: leaveResult.secondHalfLeaveRequestId,
          overrideTime: input.punchOutOverride ?? null,
          remarks: input.remarks ?? null,
          markedBy: userId,
          markedAt: new Date(),
        },
      }),
    ]);

    // Step 13: Audit log
    const auditParams: Parameters<typeof auditLog>[0] = {
      entityType: 'AttendanceRecord',
      entityId: upsertedRecord.id,
      action: existingRecord ? 'UPDATE' : 'CREATE',
      after: {
        status: finalStatus,
        source: 'HR_BOOK',
        firstHalf: input.firstHalf,
        secondHalf: input.secondHalf,
        ...(isOverriding ? { override: true, previousSource: existingRecord!.source, overriddenBy: userId } : {}),
      },
      changedBy: userId,
      companyId,
    };
    if (existingRecord) {
      auditParams.before = {
        status: existingRecord.status,
        source: existingRecord.source,
        punchIn: existingRecord.punchIn?.toISOString() ?? null,
        punchOut: existingRecord.punchOut?.toISOString() ?? null,
        halves: existingRecord.halves.map((h) => ({ half: h.half, status: h.status, leaveTypeId: h.leaveTypeId })),
      };
    }
    await auditLog(auditParams);

    // Step 14: Return full record with halves
    const fullRecord = await platformPrisma.attendanceRecord.findUnique({
      where: { id: upsertedRecord.id },
      include: {
        halves: {
          include: { leaveType: { select: { id: true, name: true, code: true } } },
        },
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        },
      },
    });

    return {
      id: fullRecord!.id,
      status: fullRecord!.status,
      source: fullRecord!.source,
      punchIn: fullRecord!.punchIn?.toISOString() ?? null,
      punchOut: fullRecord!.punchOut?.toISOString() ?? null,
      workedHours: fullRecord!.workedHours ? Number(fullRecord!.workedHours) : null,
      isLate: fullRecord!.isLate,
      lateMinutes: fullRecord!.lateMinutes,
      isOverridden: fullRecord!.isOverridden,
      halves: fullRecord!.halves.map((h) => ({
        id: h.id,
        half: h.half,
        status: h.status,
        leaveTypeId: h.leaveTypeId,
        leaveTypeName: (h as any).leaveType?.name ?? null,
        leaveRequestId: h.leaveRequestId,
      })),
      updatedAt: fullRecord!.updatedAt.toISOString(),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  3. saveAll — Batch mark attendance for multiple employees
  // ══════════════════════════════════════════════════════════════════════════

  async saveAll(companyId: string, input: BookSaveAllInput, userId: string) {
    const results: Array<{
      employeeId: string;
      success: boolean;
      record?: any;
      error?: string;
    }> = [];

    for (const entry of input.entries) {
      try {
        const record = await this.markAttendance(
          companyId,
          {
            employeeId: entry.employeeId,
            date: input.date,
            firstHalf: entry.firstHalf,
            secondHalf: entry.secondHalf,
            punchInOverride: entry.punchInOverride,
            punchOutOverride: entry.punchOutOverride,
            remarks: entry.remarks,
            forceOverride: entry.forceOverride,
            existingRecordUpdatedAt: entry.existingRecordUpdatedAt,
          },
          userId,
        );
        results.push({ employeeId: entry.employeeId, success: true, record });
      } catch (err: any) {
        results.push({
          employeeId: entry.employeeId,
          success: false,
          error: err.message || 'Unknown error',
        });
      }
    }

    return {
      results,
      summary: {
        total: input.entries.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Private: handleLeaveForHalves
  // ══════════════════════════════════════════════════════════════════════════

  private async handleLeaveForHalves(params: {
    companyId: string;
    employeeId: string;
    date: string;
    dateAsUtc: Date;
    year: number;
    firstHalf: HalfInput;
    secondHalf: HalfInput;
    existingHalves: Array<{
      id: string;
      half: string;
      status: string;
      leaveTypeId: string | null;
      leaveRequestId: string | null;
    }>;
    forceOverride: boolean;
    userId: string;
  }): Promise<LeaveHandleResult> {
    const { companyId, employeeId, date, dateAsUtc, year, firstHalf, secondHalf, existingHalves, forceOverride, userId } = params;

    const existingFirstHalf = existingHalves.find((h) => h.half === 'FIRST_HALF');
    const existingSecondHalf = existingHalves.find((h) => h.half === 'SECOND_HALF');

    let firstHalfLeaveRequestId: string | null = null;
    let secondHalfLeaveRequestId: string | null = null;

    // Check if both halves are ON_LEAVE with the same leave type → full-day leave
    const bothOnLeave =
      firstHalf.status === 'ON_LEAVE' &&
      secondHalf.status === 'ON_LEAVE' &&
      firstHalf.leaveTypeId === secondHalf.leaveTypeId;

    if (bothOnLeave) {
      // Full-day leave (1 day)
      const leaveTypeId = firstHalf.leaveTypeId!;

      // Idempotency: check if both existing halves already have matching leave
      const existingFirstMatch =
        existingFirstHalf?.status === 'ON_LEAVE' &&
        existingFirstHalf.leaveTypeId === leaveTypeId &&
        existingFirstHalf.leaveRequestId;
      const existingSecondMatch =
        existingSecondHalf?.status === 'ON_LEAVE' &&
        existingSecondHalf.leaveTypeId === leaveTypeId &&
        existingSecondHalf.leaveRequestId;

      if (existingFirstMatch && existingSecondMatch && existingFirstHalf!.leaveRequestId === existingSecondHalf!.leaveRequestId) {
        // Reuse existing full-day leave request
        firstHalfLeaveRequestId = existingFirstHalf!.leaveRequestId;
        secondHalfLeaveRequestId = existingSecondHalf!.leaveRequestId;
      } else {
        // Cancel any existing different leaves
        if (existingFirstHalf?.leaveRequestId && existingFirstHalf.leaveTypeId !== leaveTypeId) {
          if (!forceOverride) {
            throw ApiError.conflict(
              'First half has a different leave type assigned. Set forceOverride to change it.',
            );
          }
          await this.cancelHalfLeaveRequest(existingFirstHalf.leaveRequestId, employeeId, year);
        }
        if (existingSecondHalf?.leaveRequestId && existingSecondHalf.leaveTypeId !== leaveTypeId) {
          if (!forceOverride) {
            throw ApiError.conflict(
              'Second half has a different leave type assigned. Set forceOverride to change it.',
            );
          }
          // Only cancel if it's a different request than what we already cancelled
          if (existingSecondHalf.leaveRequestId !== existingFirstHalf?.leaveRequestId) {
            await this.cancelHalfLeaveRequest(existingSecondHalf.leaveRequestId, employeeId, year);
          }
        }

        // Create full-day leave
        const leaveRequestId = await this.createOrReuseLeaveRequest({
          companyId,
          employeeId,
          leaveTypeId,
          date,
          dateAsUtc,
          year,
          days: 1,
          isHalfDay: false,
          halfDayType: null,
          userId,
        });
        firstHalfLeaveRequestId = leaveRequestId;
        secondHalfLeaveRequestId = leaveRequestId;
      }
    } else {
      // Process each half independently
      firstHalfLeaveRequestId = await this.processHalfLeave({
        companyId,
        employeeId,
        date,
        dateAsUtc,
        year,
        halfInput: firstHalf,
        existingHalf: existingFirstHalf ?? null,
        halfType: 'FIRST_HALF',
        forceOverride,
        userId,
      });

      secondHalfLeaveRequestId = await this.processHalfLeave({
        companyId,
        employeeId,
        date,
        dateAsUtc,
        year,
        halfInput: secondHalf,
        existingHalf: existingSecondHalf ?? null,
        halfType: 'SECOND_HALF',
        forceOverride,
        userId,
      });
    }

    return { firstHalfLeaveRequestId, secondHalfLeaveRequestId };
  }

  /**
   * Process leave for a single half (FIRST_HALF or SECOND_HALF).
   * Returns the leaveRequestId if the half is ON_LEAVE, null otherwise.
   */
  private async processHalfLeave(params: {
    companyId: string;
    employeeId: string;
    date: string;
    dateAsUtc: Date;
    year: number;
    halfInput: HalfInput;
    existingHalf: {
      id: string;
      half: string;
      status: string;
      leaveTypeId: string | null;
      leaveRequestId: string | null;
    } | null;
    halfType: 'FIRST_HALF' | 'SECOND_HALF';
    forceOverride: boolean;
    userId: string;
  }): Promise<string | null> {
    const { companyId, employeeId, date, dateAsUtc, year, halfInput, existingHalf, halfType, forceOverride, userId } = params;

    if (halfInput.status === 'ON_LEAVE') {
      const leaveTypeId = halfInput.leaveTypeId!;

      // Idempotency: reuse if existing half matches
      if (
        existingHalf?.status === 'ON_LEAVE' &&
        existingHalf.leaveTypeId === leaveTypeId &&
        existingHalf.leaveRequestId
      ) {
        return existingHalf.leaveRequestId;
      }

      // Different leave type on this half — need force override
      if (existingHalf?.leaveRequestId && existingHalf.leaveTypeId !== leaveTypeId) {
        if (!forceOverride) {
          throw ApiError.conflict(
            `${halfType === 'FIRST_HALF' ? 'First' : 'Second'} half has a different leave type assigned. Set forceOverride to change it.`,
          );
        }
        await this.cancelHalfLeaveRequest(existingHalf.leaveRequestId, employeeId, year);
      }

      // Create half-day leave
      return this.createOrReuseLeaveRequest({
        companyId,
        employeeId,
        leaveTypeId,
        date,
        dateAsUtc,
        year,
        days: 0.5,
        isHalfDay: true,
        halfDayType: halfType,
        userId,
      });
    }

    // Status changed AWAY from ON_LEAVE → cancel existing leave if any
    // (At this point halfInput.status is PRESENT or ABSENT, so always cancel)
    if (existingHalf?.status === 'ON_LEAVE' && existingHalf.leaveRequestId) {
      await this.cancelHalfLeaveRequest(existingHalf.leaveRequestId, employeeId, year);
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Private: createOrReuseLeaveRequest
  // ══════════════════════════════════════════════════════════════════════════

  private async createOrReuseLeaveRequest(params: {
    companyId: string;
    employeeId: string;
    leaveTypeId: string;
    date: string;
    dateAsUtc: Date;
    year: number;
    days: number;
    isHalfDay: boolean;
    halfDayType: string | null;
    userId: string;
  }): Promise<string> {
    const { companyId, employeeId, leaveTypeId, dateAsUtc, year, days, isHalfDay, halfDayType, userId } = params;

    // Get leave type name for error messages
    const leaveType = await platformPrisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { name: true },
    });
    if (!leaveType) {
      throw ApiError.notFound(`Leave type not found: ${leaveTypeId}`);
    }

    // Entire deduction + creation must be in a single transaction with row-level lock
    const leaveRequestId = await platformPrisma.$transaction(async (tx) => {
      // Row-level lock on LeaveBalance using FOR UPDATE
      const balanceRows = await tx.$queryRaw<
        Array<{ id: string; balance: number; taken: number }>
      >`
        SELECT id, balance::float as balance, taken::float as taken
        FROM leave_balances
        WHERE employee_id = ${employeeId}
          AND leave_type_id = ${leaveTypeId}
          AND year = ${year}
        FOR UPDATE
      `;

      const balanceRow = balanceRows?.[0];
      if (!balanceRow) {
        throw ApiError.unprocessableEntity(
          `No leave balance found for ${leaveType!.name} in ${year}. Please configure leave balances first.`,
        );
      }

      if (balanceRow.balance < days) {
        throw ApiError.unprocessableEntity(
          `Insufficient ${leaveType!.name} balance. Required: ${days} day(s), Available: ${balanceRow.balance} day(s).`,
        );
      }

      // Deduct balance
      await tx.leaveBalance.update({
        where: { id: balanceRow.id },
        data: {
          taken: { increment: days },
          balance: { decrement: days },
        },
      });

      // Create leave request
      const leaveRequest = await tx.leaveRequest.create({
        data: {
          employeeId,
          leaveTypeId,
          fromDate: dateAsUtc,
          toDate: dateAsUtc,
          days,
          isHalfDay,
          halfDayType,
          reason: `Marked via Attendance Book${isHalfDay ? ` (${halfDayType === 'FIRST_HALF' ? 'First Half' : 'Second Half'})` : ''}`,
          status: 'AUTO_APPROVED',
          approvedBy: userId,
          approvedAt: new Date(),
          companyId,
        },
      });

      return leaveRequest.id;
    });

    return leaveRequestId;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Private: cancelHalfLeaveRequest
  // ══════════════════════════════════════════════════════════════════════════

  private async cancelHalfLeaveRequest(
    leaveRequestId: string,
    employeeId: string,
    year: number,
  ): Promise<void> {
    const leaveRequest = await platformPrisma.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      select: { id: true, status: true, leaveTypeId: true, days: true },
    });

    if (!leaveRequest) {
      logger.warn(`Leave request ${leaveRequestId} not found for cancellation`);
      return;
    }

    if (leaveRequest.status !== 'APPROVED' && leaveRequest.status !== 'AUTO_APPROVED') {
      logger.warn(
        `Leave request ${leaveRequestId} has status ${leaveRequest.status}, skipping cancellation`,
      );
      return;
    }

    const daysToRefund = Number(leaveRequest.days);

    // Refund balance + cancel request atomically
    await platformPrisma.$transaction(async (tx) => {
      await tx.leaveBalance.updateMany({
        where: {
          employeeId,
          leaveTypeId: leaveRequest!.leaveTypeId,
          year,
        },
        data: {
          taken: { decrement: daysToRefund },
          balance: { increment: daysToRefund },
        },
      });

      await tx.leaveRequest.update({
        where: { id: leaveRequestId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      });
    });

    logger.info(
      `Cancelled leave request ${leaveRequestId} and refunded ${daysToRefund} day(s) for employee ${employeeId}`,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Private: buildEvaluationContext
  // ══════════════════════════════════════════════════════════════════════════

  private async buildEvaluationContext(
    companyId: string,
    employeeId: string,
    shiftId: string | null,
    locationId: string | null,
    date: Date,
    companyTimezone: string,
  ): Promise<EvaluationContext> {
    const holiday = await platformPrisma.holidayCalendar.findFirst({
      where: { companyId, date },
      select: { name: true },
    });

    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
      select: { weekOff1: true, weekOff2: true },
    });

    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dtAtt = DateTime.fromJSDate(date).setZone(companyTimezone);
    const dow = dayOfWeek[dtAtt.weekday % 7];
    const isWeekOff = dow === roster?.weekOff1 || dow === roster?.weekOff2;

    return {
      employeeId,
      shiftId,
      locationId,
      date,
      isHoliday: !!holiday,
      isWeekOff,
      ...(holiday?.name ? { holidayName: holiday.name } : {}),
      ...(roster ? { rosterPattern: `${roster.weekOff1 ?? ''}${roster.weekOff2 ? '/' + roster.weekOff2 : ''}` } : {}),
    };
  }
}

export const attendanceBookService = new AttendanceBookService();
