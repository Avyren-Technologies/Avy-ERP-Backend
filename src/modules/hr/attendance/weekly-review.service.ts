/**
 * Weekly Review Service
 *
 * Handles weekly attendance review for HR admins. Computes review flags
 * for attendance records (missing punches, auto-mapped shifts, anomalies)
 * and provides bulk review, shift remap, and punch editing capabilities.
 */

import { AttendanceStatus } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { logger } from '../../../config/logger';
import { ApiError } from '../../../shared/errors';
import {
  resolveAttendanceStatus,
  type ShiftInfo,
  type AttendanceRulesInput,
} from '../../../shared/services/attendance-status-resolver.service';
import { resolvePolicy, type EvaluationContext } from '../../../shared/services/policy-resolver.service';
import {
  getCachedAttendanceRules,
  getCachedCompanySettings,
  getCachedOvertimeRules,
} from '../../../shared/utils/config-cache';
import { DateTime } from 'luxon';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReviewFlag =
  | 'MISSING_PUNCH'
  | 'AUTO_MAPPED'
  | 'WORKED_ON_LEAVE'
  | 'LATE_BEYOND_THRESHOLD'
  | 'MULTIPLE_SHIFT_ANOMALY'
  | 'OT_ANOMALY';

interface WeeklyReviewOptions {
  departmentId?: string;
  flag?: ReviewFlag;
  page?: number;
  limit?: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class WeeklyReviewService {
  // ────────────────────────────────────────────────────────────────────
  // Get Weekly Review Records
  // ────────────────────────────────────────────────────────────────────

  async getWeeklyReviewRecords(
    companyId: string,
    weekStart: Date,
    weekEnd: Date,
    options: WeeklyReviewOptions = {},
  ) {
    const { departmentId, flag, page = 1, limit = 50 } = options;

    const rules = await getCachedAttendanceRules(companyId);
    const overtimeRules = await getCachedOvertimeRules(companyId);

    // Build the base where clause
    const where: any = {
      companyId,
      date: { gte: weekStart, lte: weekEnd },
    };

    if (departmentId) {
      where.employee = { departmentId };
    }

    // Fetch all records in the date range (we need to compute flags before pagination)
    const allRecords = await platformPrisma.attendanceRecord.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    // Compute review flags for each record
    const NON_PUNCH_STATUSES: string[] = ['HOLIDAY', 'WEEK_OFF', 'ON_LEAVE'];
    const dailyCapHours = overtimeRules.dailyCapHours ? Number(overtimeRules.dailyCapHours) : null;

    const recordsWithFlags = allRecords.map((record) => {
      const reviewFlags: ReviewFlag[] = [];

      // MISSING_PUNCH: punchIn null OR punchOut null (and status not HOLIDAY/WEEK_OFF/ON_LEAVE)
      if (
        (!record.punchIn || !record.punchOut) &&
        !NON_PUNCH_STATUSES.includes(record.status)
      ) {
        reviewFlags.push('MISSING_PUNCH');
      }

      // AUTO_MAPPED: record.isAutoMapped === true
      if (record.isAutoMapped) {
        reviewFlags.push('AUTO_MAPPED');
      }

      // WORKED_ON_LEAVE: leaveRequestId exists AND workedHours > 0
      if (record.leaveRequestId && record.workedHours && Number(record.workedHours) > 0) {
        reviewFlags.push('WORKED_ON_LEAVE');
      }

      // LATE_BEYOND_THRESHOLD: lateMinutes > maxLateCheckInMinutes
      if (record.lateMinutes && record.lateMinutes > rules.maxLateCheckInMinutes) {
        reviewFlags.push('LATE_BEYOND_THRESHOLD');
      }

      // MULTIPLE_SHIFT_ANOMALY: shiftSequence > 1
      if (record.shiftSequence > 1) {
        reviewFlags.push('MULTIPLE_SHIFT_ANOMALY');
      }

      // OT_ANOMALY: overtimeHours exists AND overtime rules have daily cap AND overtimeHours > dailyCapHours
      if (
        record.overtimeHours &&
        dailyCapHours !== null &&
        Number(record.overtimeHours) > dailyCapHours
      ) {
        reviewFlags.push('OT_ANOMALY');
      }

      return { ...record, reviewFlags };
    });

    // Filter by specific flag if provided
    const filtered = flag
      ? recordsWithFlags.filter((r) => r.reviewFlags.includes(flag))
      : recordsWithFlags;

    // Paginate
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginated = filtered.slice(offset, offset + limit);

    return {
      records: paginated,
      meta: { page, limit, total, totalPages },
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Get Weekly Review Summary
  // ────────────────────────────────────────────────────────────────────

  async getWeeklyReviewSummary(companyId: string, weekStart: Date, weekEnd: Date) {
    const rules = await getCachedAttendanceRules(companyId);
    const overtimeRules = await getCachedOvertimeRules(companyId);

    const where = {
      companyId,
      date: { gte: weekStart, lte: weekEnd },
    };

    const allRecords = await platformPrisma.attendanceRecord.findMany({
      where,
      select: {
        id: true,
        punchIn: true,
        punchOut: true,
        status: true,
        isAutoMapped: true,
        leaveRequestId: true,
        workedHours: true,
        lateMinutes: true,
        shiftSequence: true,
        overtimeHours: true,
        isReviewed: true,
      },
    });

    const NON_PUNCH_STATUSES: string[] = ['HOLIDAY', 'WEEK_OFF', 'ON_LEAVE'];
    const dailyCapHours = overtimeRules.dailyCapHours ? Number(overtimeRules.dailyCapHours) : null;

    const flagCounts: Record<ReviewFlag, number> = {
      MISSING_PUNCH: 0,
      AUTO_MAPPED: 0,
      WORKED_ON_LEAVE: 0,
      LATE_BEYOND_THRESHOLD: 0,
      MULTIPLE_SHIFT_ANOMALY: 0,
      OT_ANOMALY: 0,
    };

    let reviewed = 0;
    let unreviewed = 0;

    for (const record of allRecords) {
      if (record.isReviewed) {
        reviewed++;
      } else {
        unreviewed++;
      }

      if (
        (!record.punchIn || !record.punchOut) &&
        !NON_PUNCH_STATUSES.includes(record.status)
      ) {
        flagCounts.MISSING_PUNCH++;
      }

      if (record.isAutoMapped) {
        flagCounts.AUTO_MAPPED++;
      }

      if (record.leaveRequestId && record.workedHours && Number(record.workedHours) > 0) {
        flagCounts.WORKED_ON_LEAVE++;
      }

      if (record.lateMinutes && record.lateMinutes > rules.maxLateCheckInMinutes) {
        flagCounts.LATE_BEYOND_THRESHOLD++;
      }

      if (record.shiftSequence > 1) {
        flagCounts.MULTIPLE_SHIFT_ANOMALY++;
      }

      if (
        record.overtimeHours &&
        dailyCapHours !== null &&
        Number(record.overtimeHours) > dailyCapHours
      ) {
        flagCounts.OT_ANOMALY++;
      }
    }

    return {
      totalRecords: allRecords.length,
      flagCounts,
      reviewed,
      unreviewed,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Remap Shift
  // ────────────────────────────────────────────────────────────────────

  async remapShift(companyId: string, recordId: string, newShiftId: string, userId: string) {
    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { id: recordId },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
      },
    });

    if (!record) throw ApiError.notFound('Attendance record not found');
    if (record.companyId !== companyId) throw ApiError.notFound('Attendance record not found');

    // Validate new shift exists and belongs to the company
    const newShift = await platformPrisma.companyShift.findUnique({
      where: { id: newShiftId },
      select: { id: true, name: true, startTime: true, endTime: true, isCrossDay: true, companyId: true },
    });

    if (!newShift) throw ApiError.notFound('Shift not found');
    if (newShift.companyId !== companyId) throw ApiError.notFound('Shift not found');

    // Re-resolve attendance status with new shift
    const statusResult = await this.reResolveStatus(companyId, record, {
      shiftId: newShiftId,
      shiftInfo: {
        startTime: newShift.startTime,
        endTime: newShift.endTime,
        isCrossDay: newShift.isCrossDay,
      },
    });

    const updated = await platformPrisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        shiftId: newShiftId,
        isAutoMapped: false,
        workedHours: statusResult.workedHours,
        status: statusResult.status as AttendanceStatus,
        isLate: statusResult.isLate,
        lateMinutes: statusResult.lateMinutes || null,
        isEarlyExit: statusResult.isEarlyExit,
        earlyMinutes: statusResult.earlyMinutes || null,
        overtimeHours: statusResult.overtimeHours > 0 ? statusResult.overtimeHours : null,
        appliedLateDeduction: statusResult.appliedLateDeduction,
        appliedEarlyExitDeduction: statusResult.appliedEarlyExitDeduction,
        finalStatusReason: statusResult.finalStatusReason,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    });

    logger.info(
      `Weekly review: shift remapped for record ${recordId} to shift ${newShiftId} by user ${userId}`,
    );

    return updated;
  }

  // ────────────────────────────────────────────────────────────────────
  // Edit Punches
  // ────────────────────────────────────────────────────────────────────

  async editPunches(
    companyId: string,
    recordId: string,
    punchIn: string | undefined,
    punchOut: string | undefined,
    reason: string,
    userId: string,
  ) {
    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { id: recordId },
      include: {
        employee: { select: { id: true, employeeId: true, firstName: true, lastName: true } },
        shift: { select: { id: true, startTime: true, endTime: true, isCrossDay: true } },
      },
    });

    if (!record) throw ApiError.notFound('Attendance record not found');
    if (record.companyId !== companyId) throw ApiError.notFound('Attendance record not found');

    const newPunchIn = punchIn ? new Date(punchIn) : record.punchIn;
    const newPunchOut = punchOut ? new Date(punchOut) : record.punchOut;

    // Build shift info from existing shift
    let shiftInfo: ShiftInfo | null = null;
    if (record.shift) {
      shiftInfo = {
        startTime: record.shift.startTime,
        endTime: record.shift.endTime,
        isCrossDay: record.shift.isCrossDay,
      };
    }

    // Re-resolve attendance status with new punches
    const statusResult = await this.reResolveStatus(companyId, record, {
      punchIn: newPunchIn,
      punchOut: newPunchOut,
      shiftInfo,
    });

    const updated = await platformPrisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        punchIn: newPunchIn,
        punchOut: newPunchOut,
        workedHours: statusResult.workedHours,
        status: statusResult.status as AttendanceStatus,
        isLate: statusResult.isLate,
        lateMinutes: statusResult.lateMinutes || null,
        isEarlyExit: statusResult.isEarlyExit,
        earlyMinutes: statusResult.earlyMinutes || null,
        overtimeHours: statusResult.overtimeHours > 0 ? statusResult.overtimeHours : null,
        appliedLateDeduction: statusResult.appliedLateDeduction,
        appliedEarlyExitDeduction: statusResult.appliedEarlyExitDeduction,
        finalStatusReason: statusResult.finalStatusReason,
        isRegularized: true,
        regularizedAt: new Date(),
        regularizedBy: userId,
        regularizationReason: reason,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            department: { select: { id: true, name: true } },
            designation: { select: { id: true, name: true } },
          },
        },
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
      },
    });

    logger.info(
      `Weekly review: punches edited for record ${recordId} by user ${userId} — reason: ${reason}`,
    );

    return updated;
  }

  // ────────────────────────────────────────────────────────────────────
  // Mark Reviewed
  // ────────────────────────────────────────────────────────────────────

  async markReviewed(companyId: string, recordIds: string[], userId: string) {
    // Validate all records belong to the company
    const records = await platformPrisma.attendanceRecord.findMany({
      where: { id: { in: recordIds }, companyId },
      select: { id: true },
    });

    if (records.length !== recordIds.length) {
      const foundIds = new Set(records.map((r) => r.id));
      const missing = recordIds.filter((id) => !foundIds.has(id));
      throw ApiError.badRequest(`Some records not found or do not belong to this company: ${missing.join(', ')}`);
    }

    const result = await platformPrisma.attendanceRecord.updateMany({
      where: { id: { in: recordIds }, companyId },
      data: {
        isReviewed: true,
        reviewedBy: userId,
        reviewedAt: new Date(),
      },
    });

    logger.info(
      `Weekly review: ${result.count} records marked as reviewed by user ${userId}`,
    );

    return { count: result.count };
  }

  // ────────────────────────────────────────────────────────────────────
  // Private: Re-Resolve Attendance Status
  // ────────────────────────────────────────────────────────────────────

  private async reResolveStatus(
    companyId: string,
    record: any,
    overrides: {
      shiftId?: string;
      shiftInfo?: ShiftInfo | null;
      punchIn?: Date | null;
      punchOut?: Date | null;
    },
  ) {
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';

    const effectiveShiftId = overrides.shiftId ?? record.shiftId;
    const effectivePunchIn = overrides.punchIn !== undefined ? overrides.punchIn : record.punchIn;
    const effectivePunchOut = overrides.punchOut !== undefined ? overrides.punchOut : record.punchOut;

    // Build shift info
    let shiftInfo: ShiftInfo | null = overrides.shiftInfo !== undefined ? overrides.shiftInfo : null;
    if (!shiftInfo && effectiveShiftId && !overrides.shiftInfo) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: effectiveShiftId },
        select: { startTime: true, endTime: true, isCrossDay: true },
      });
      if (shift) {
        shiftInfo = {
          startTime: shift.startTime,
          endTime: shift.endTime,
          isCrossDay: shift.isCrossDay,
        };
      }
    }

    // Check holiday
    const attendanceDate = record.date;
    const holiday = await platformPrisma.holidayCalendar.findFirst({
      where: { companyId, date: attendanceDate },
      select: { name: true },
    });

    // Check week-off
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
      select: { weekOff1: true, weekOff2: true },
    });
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dtAtt = DateTime.fromJSDate(attendanceDate).setZone(companyTimezone);
    const dow = dayOfWeek[dtAtt.weekday % 7];
    const isWeekOff = dow === roster?.weekOff1 || dow === roster?.weekOff2;

    const evaluationContext: EvaluationContext = {
      employeeId: record.employeeId,
      shiftId: effectiveShiftId,
      locationId: record.locationId,
      date: attendanceDate,
      isHoliday: !!holiday,
      isWeekOff,
      ...(holiday?.name && { holidayName: holiday.name }),
      ...(roster && { rosterPattern: `${roster.weekOff1 ?? ''}${roster.weekOff2 ? '/' + roster.weekOff2 : ''}` }),
    };

    // Resolve policy
    const { policy } = await resolvePolicy(companyId, evaluationContext);

    // Build rules input
    const rules = await getCachedAttendanceRules(companyId);
    const rulesInput: AttendanceRulesInput = {
      lopAutoDeduct: rules.lopAutoDeduct,
      autoMarkAbsentIfNoPunch: rules.autoMarkAbsentIfNoPunch,
      autoHalfDayEnabled: rules.autoHalfDayEnabled,
      lateDeductionType: rules.lateDeductionType,
      lateDeductionValue: rules.lateDeductionValue ? Number(rules.lateDeductionValue) : null,
      earlyExitDeductionType: rules.earlyExitDeductionType,
      earlyExitDeductionValue: rules.earlyExitDeductionValue ? Number(rules.earlyExitDeductionValue) : null,
      ignoreLateOnLeaveDay: rules.ignoreLateOnLeaveDay,
      ignoreLateOnHoliday: rules.ignoreLateOnHoliday,
      ignoreLateOnWeekOff: rules.ignoreLateOnWeekOff,
    };

    // Resolve attendance status
    const statusResult = resolveAttendanceStatus(
      effectivePunchIn,
      effectivePunchOut,
      shiftInfo,
      policy,
      evaluationContext,
      rulesInput,
      companyTimezone,
    );

    return statusResult;
  }
}

export const weeklyReviewService = new WeeklyReviewService();
