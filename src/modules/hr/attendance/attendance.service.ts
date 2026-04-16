import { Prisma, AttendanceStatus, AttendanceSource, OTMultiplierSource, OvertimeRequestStatus } from '@prisma/client';
import { platformPrisma } from '../../../config/database';
import { ApiError } from '../../../shared/errors';
import { logger } from '../../../config/logger';
import {
  invalidateAttendanceRules,
  invalidateOvertimeRules,
  getCachedOvertimeRules,
  getCachedAttendanceRules,
  getCachedCompanySettings,
} from '../../../shared/utils/config-cache';
import { resolvePolicy, type EvaluationContext } from '../../../shared/services/policy-resolver.service';
import { resolveAttendanceStatus, type ShiftInfo, type AttendanceRulesInput } from '../../../shared/services/attendance-status-resolver.service';
import { validateLocationConstraints } from '../../../shared/services/location-validator.service';
import { DateTime } from 'luxon';
import { parseInCompanyTimezone } from '../../../shared/utils/timezone';
import { n } from '../../../shared/utils/prisma-helpers';
import { notificationService } from '../../../core/notifications/notification.service';
import { getRequesterUserId } from '../../../core/notifications/dispatch/approver-resolver';

interface ListOptions {
  page?: number;
  limit?: number;
}

interface AttendanceListOptions extends ListOptions {
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  departmentId?: string;
}

interface OverrideListOptions extends ListOptions {
  status?: string;
}

interface HolidayListOptions extends ListOptions {
  year?: number;
  type?: string;
}

interface OvertimeRequestListOptions extends ListOptions {
  status?: string;
  employeeId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export class AttendanceService {
  // ────────────────────────────────────────────────────────────────────
  // Attendance Records
  // ────────────────────────────────────────────────────────────────────

  async listRecords(companyId: string, options: AttendanceListOptions = {}) {
    const { page = 1, limit = 25, employeeId, dateFrom, dateTo, status, departmentId } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };

    if (employeeId) {
      where.employeeId = employeeId;
    }

    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    if (status) {
      where.status = status;
    }

    if (departmentId) {
      where.employee = { departmentId };
    }

    const [records, total] = await Promise.all([
      platformPrisma.attendanceRecord.findMany({
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
          location: { select: { id: true, name: true } },
        },
        skip: offset,
        take: limit,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      platformPrisma.attendanceRecord.count({ where }),
    ]);

    return { records, total, page, limit };
  }

  async getRecord(companyId: string, id: string) {
    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { id },
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
        location: { select: { id: true, name: true } },
        overrides: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!record || record.companyId !== companyId) {
      throw ApiError.notFound('Attendance record not found');
    }

    return record;
  }

  async createRecord(companyId: string, data: any) {
    // Verify employee belongs to company
    const employee = await platformPrisma.employee.findUnique({
      where: { id: data.employeeId },
      select: {
        id: true,
        companyId: true,
        shiftId: true,
        employeeTypeId: true,
        locationId: true,
      },
    });
    if (!employee || employee.companyId !== companyId) {
      throw ApiError.badRequest('Employee not found in this company');
    }

    // Check for duplicate record on same date
    const attendanceDate = new Date(data.date);
    const existing = await platformPrisma.attendanceRecord.findUnique({
      where: { employeeId_date: { employeeId: data.employeeId, date: attendanceDate } },
    });
    if (existing) {
      throw ApiError.conflict('Attendance record already exists for this employee on this date');
    }

    // ── Step 1: Location Validation (fail fast) ──
    const locationId = data.locationId ?? employee.locationId ?? null;
    if (locationId) {
      const locationResult = await validateLocationConstraints(locationId, {
        latitude: data.checkInLatitude,
        longitude: data.checkInLongitude,
        source: data.source ?? 'MANUAL',
        selfieUrl: data.checkInPhotoUrl,
      });
      if (!locationResult.valid) {
        throw ApiError.badRequest(`Location constraint violated: ${locationResult.reason}`);
      }
    }

    // ── Step 2: Build Evaluation Context ──
    const effectiveShiftId = data.shiftId ?? employee.shiftId ?? null;
    const dateStr = attendanceDate.toISOString().split('T')[0]!;

    // Check if date is a holiday
    const holiday = await platformPrisma.holidayCalendar.findFirst({
      where: {
        companyId,
        date: attendanceDate,
      },
      select: { name: true },
    });

    // Check if date is a week-off using default roster
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
      select: { weekOff1: true, weekOff2: true },
    });
    // ── Step 2b: Get company timezone (needed for day-of-week resolution) ──
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';

    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dtAtt = DateTime.fromJSDate(attendanceDate).setZone(companyTimezone);
    const dow = dayOfWeek[dtAtt.weekday % 7];
    const isWeekOff = dow === roster?.weekOff1 || dow === roster?.weekOff2;

    const evaluationContext: EvaluationContext = {
      employeeId: data.employeeId,
      shiftId: effectiveShiftId,
      locationId,
      date: attendanceDate,
      isHoliday: !!holiday,
      isWeekOff,
      ...(holiday?.name && { holidayName: holiday.name }),
      ...(roster && { rosterPattern: `${roster.weekOff1 ?? ''}${roster.weekOff2 ? '/' + roster.weekOff2 : ''}` }),
    };

    // ── Step 3: Resolve Policy ──
    const { policy, trace } = await resolvePolicy(companyId, evaluationContext);

    // ── Step 3b: Enforce resolved selfie/GPS requirements ──
    // The policy resolver merges location, shift, and attendance rule settings.
    // This check ensures selfie/GPS is enforced even when no location is assigned.
    if (policy.selfieRequired && !data.checkInPhotoUrl) {
      throw ApiError.badRequest('Selfie photo is required for check-in (per resolved attendance policy)');
    }
    if (policy.gpsRequired && (data.checkInLatitude == null || data.checkInLongitude == null)) {
      throw ApiError.badRequest('GPS coordinates are required for check-in (per resolved attendance policy)');
    }

    // ── Step 5: Fetch shift info for status resolver ──
    let shiftInfo: ShiftInfo | null = null;
    if (effectiveShiftId) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: effectiveShiftId },
        select: { startTime: true, endTime: true, isCrossDay: true, shiftType: true },
      });
      if (shift) {
        shiftInfo = {
          startTime: shift.startTime,
          endTime: shift.endTime,
          isCrossDay: shift.isCrossDay,
        };
      }
    }

    // ── Step 6: Fetch attendance rules for status resolver ──
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

    // ── Step 7: Resolve Attendance Status ──
    let punchIn = data.punchIn ? new Date(data.punchIn) : null;
    let punchOut = data.punchOut ? new Date(data.punchOut) : null;

    // ── Apply punchTimeRounding to round raw punch times before status resolution ──
    if (rules.punchTimeRounding !== 'NONE' && (punchIn || punchOut)) {
      const roundPunch = (d: Date, direction: string): Date => {
        const roundingMinutes = rules.punchTimeRounding === 'NEAREST_5' ? 5 : 15;
        const ms = d.getTime();
        const roundingMs = roundingMinutes * 60 * 1000;
        let rounded: number;
        if (direction === 'UP') {
          rounded = Math.ceil(ms / roundingMs) * roundingMs;
        } else if (direction === 'DOWN') {
          rounded = Math.floor(ms / roundingMs) * roundingMs;
        } else {
          // NEAREST
          rounded = Math.round(ms / roundingMs) * roundingMs;
        }
        return new Date(rounded);
      };
      const dir = rules.punchTimeRoundingDirection ?? 'NEAREST';
      if (punchIn) punchIn = roundPunch(punchIn, dir);
      if (punchOut) punchOut = roundPunch(punchOut, dir);
    }

    const statusResult = resolveAttendanceStatus(
      punchIn,
      punchOut,
      shiftInfo,
      policy,
      evaluationContext,
      rulesInput,
      companyTimezone,
    );

    // ── Step 7b: ignoreLateOnLeaveDay — suppress late if employee has approved leave on this date ──
    if (statusResult.isLate && rules.ignoreLateOnLeaveDay) {
      const approvedLeave = await platformPrisma.leaveRequest.findFirst({
        where: {
          employeeId: data.employeeId,
          status: 'APPROVED',
          fromDate: { lte: attendanceDate },
          toDate: { gte: attendanceDate },
        },
        select: { id: true },
      });
      if (approvedLeave) {
        statusResult.isLate = false;
        statusResult.appliedLateDeduction = null;
        statusResult.finalStatusReason += ' (late suppressed — leave day exception)';
        if (statusResult.status === 'LATE') {
          statusResult.status = 'PRESENT';
        }
        logger.info(
          `Late suppressed for employee ${data.employeeId} on ${dateStr} — approved leave found (ignoreLateOnLeaveDay=true)`,
        );
      }
    }

    // ── Step 8: Create attendance record with resolved values ──
    const record = await platformPrisma.attendanceRecord.create({
      data: {
        companyId,
        employeeId: data.employeeId,
        date: attendanceDate,
        shiftId: effectiveShiftId,
        punchIn,
        punchOut,
        workedHours: statusResult.workedHours,
        status: statusResult.status as AttendanceStatus,
        source: data.source,
        isLate: statusResult.isLate,
        lateMinutes: statusResult.lateMinutes || null,
        isEarlyExit: statusResult.isEarlyExit,
        earlyMinutes: statusResult.earlyMinutes || null,
        overtimeHours: statusResult.overtimeHours > 0 ? statusResult.overtimeHours : null,
        remarks: n(data.remarks),
        locationId,
        checkInLatitude: data.checkInLatitude ?? null,
        checkInLongitude: data.checkInLongitude ?? null,
        checkInPhotoUrl: data.checkInPhotoUrl ?? null,

        // Resolved policy snapshot
        appliedGracePeriodMinutes: policy.gracePeriodMinutes,
        appliedFullDayThresholdHours: policy.fullDayThresholdHours,
        appliedHalfDayThresholdHours: policy.halfDayThresholdHours,
        appliedBreakDeductionMinutes: policy.breakDeductionMinutes,
        appliedPunchMode: policy.punchMode as any,
        appliedLateDeduction: statusResult.appliedLateDeduction,
        appliedEarlyExitDeduction: statusResult.appliedEarlyExitDeduction,

        // Resolution trace & context
        resolutionTrace: trace,
        evaluationContext: {
          isHoliday: evaluationContext.isHoliday,
          isWeekOff: evaluationContext.isWeekOff,
          holidayName: evaluationContext.holidayName ?? null,
          rosterPattern: evaluationContext.rosterPattern ?? null,
        },
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

    // ── Step 9: OT Processing ──
    if (statusResult.overtimeHours > 0) {
      await this.processOvertimeForRecord(companyId, record, statusResult.overtimeHours, evaluationContext, employee.employeeTypeId ?? null, shiftInfo);
    }

    // ── Step 10: Late Arrivals Monthly Limit Check ──
    if (statusResult.isLate && rules.lateArrivalsAllowedPerMonth > 0) {
      await this.checkMonthlyLateLimit(companyId, record, rules.lateArrivalsAllowedPerMonth);
    }

    return record;
  }

  /**
   * Check if this employee has exceeded the monthly late arrival limit.
   * When the limit is exceeded, flags the record with a remark for HR review.
   * Does NOT automatically change attendance status — that is left for HR.
   */
  private async checkMonthlyLateLimit(
    companyId: string,
    record: any,
    allowedPerMonth: number,
  ) {
    const recordDate = new Date(record.date);
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const dtRecord = DateTime.fromJSDate(recordDate).setZone(companyTimezone);
    const monthStart = dtRecord.startOf('month').toJSDate();
    const monthEnd = dtRecord.endOf('month').toJSDate();

    const lateCountThisMonth = await platformPrisma.attendanceRecord.count({
      where: {
        companyId,
        employeeId: record.employeeId,
        date: { gte: monthStart, lte: monthEnd },
        isLate: true,
      },
    });

    if (lateCountThisMonth > allowedPerMonth) {
      const flagNote = `[LATE LIMIT EXCEEDED] ${lateCountThisMonth}/${allowedPerMonth} late arrivals this month — flagged for HR review`;
      const existingRemarks = record.remarks ?? '';
      const updatedRemarks = existingRemarks ? `${existingRemarks} | ${flagNote}` : flagNote;

      await platformPrisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          remarks: updatedRemarks,
          finalStatusReason: `${record.finalStatusReason ?? ''} | ${flagNote}`,
        },
      });

      logger.warn(
        `Late limit exceeded [employee=${record.employeeId}, month=${dtRecord.month}/${dtRecord.year}, count=${lateCountThisMonth}, limit=${allowedPerMonth}]`,
      );
    }
  }

  /**
   * Process overtime for a newly created attendance record.
   * Checks eligibility, applies calculation basis (AFTER_SHIFT / TOTAL_HOURS),
   * includeBreaksInOT, OT-specific rounding, caps (daily/weekly/monthly/continuous),
   * night shift detection, selects multiplier, and creates OT request.
   */
  private async processOvertimeForRecord(
    companyId: string,
    record: any,
    overtimeHours: number,
    context: EvaluationContext,
    employeeTypeId: string | null,
    shiftInfo: ShiftInfo | null,
  ) {
    const otRule = await getCachedOvertimeRules(companyId);

    // Check eligibility: if eligibleTypeIds is set, employee type must be in the list
    if (otRule.eligibleTypeIds) {
      const eligibleIds = otRule.eligibleTypeIds as string[];
      if (Array.isArray(eligibleIds) && eligibleIds.length > 0) {
        if (!employeeTypeId || !eligibleIds.includes(employeeTypeId)) {
          logger.info(`Employee ${record.employeeId} not eligible for OT (type ${employeeTypeId} not in eligible list)`);
          return;
        }
      }
    }

    // ── minWorkingHoursForOT: skip OT if employee hasn't met the minimum working hours threshold ──
    if (record.shiftId) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: record.shiftId },
        select: { minWorkingHoursForOT: true },
      });
      if (shift?.minWorkingHoursForOT) {
        const minHours = Number(shift.minWorkingHoursForOT);
        const workedHours = record.workedHours ? Number(record.workedHours) : 0;
        if (workedHours < minHours) {
          logger.info(`OT skipped for employee ${record.employeeId}: worked ${workedHours}h < minWorkingHoursForOT ${minHours}h`);
          return;
        }
      }
    }

    // ── OT Calculation Basis ──
    // AFTER_SHIFT (default): OT = hours beyond shift threshold (already computed by status resolver)
    // TOTAL_HOURS: OT = total worked hours (entire shift is paid as OT, e.g. for holiday/weekend work)
    let effectiveOtHours = overtimeHours;
    if (otRule.calculationBasis === 'TOTAL_HOURS') {
      const workedHours = record.workedHours ? Number(record.workedHours) : 0;
      effectiveOtHours = workedHours;
    }

    // ── thresholdMinutes: dead-zone before OT starts counting ──
    // Employee must work at least thresholdMinutes beyond their shift before any OT is counted.
    // The threshold is subtracted from raw OT — e.g. if thresholdMinutes=30 and employee worked
    // 45 min past shift, only 15 min counts as OT.
    if (otRule.thresholdMinutes > 0 && otRule.calculationBasis === 'AFTER_SHIFT') {
      const thresholdHours = otRule.thresholdMinutes / 60;
      if (effectiveOtHours <= thresholdHours) {
        logger.info(
          `OT below threshold: ${(effectiveOtHours * 60).toFixed(1)}min <= ${otRule.thresholdMinutes}min threshold for employee ${record.employeeId}`,
        );
        return;
      }
      effectiveOtHours -= thresholdHours;
    }

    // ── includeBreaksInOT ──
    // The status resolver already deducted break minutes from workedHours (and thus from OT).
    // When includeBreaksInOT is true, breaks should count toward OT hours.
    if (otRule.includeBreaksInOT && record.appliedBreakDeductionMinutes) {
      const breakHours = Number(record.appliedBreakDeductionMinutes) / 60;
      effectiveOtHours += breakHours;
    }

    // ── Apply OT-specific rounding strategy ──
    if (otRule.roundingStrategy && otRule.roundingStrategy !== 'NONE') {
      effectiveOtHours = this.applyOtRounding(effectiveOtHours, otRule.roundingStrategy as string);
    }

    // Check minimum OT minutes (after calculation basis and rounding adjustments)
    const otMinutes = effectiveOtHours * 60;
    if (otMinutes < otRule.minimumOtMinutes) {
      logger.info(`OT ${otMinutes.toFixed(1)}min below minimum ${otRule.minimumOtMinutes}min for employee ${record.employeeId}`);
      return;
    }

    // ── Apply caps if enforceCaps is true ──
    let cappedHours = effectiveOtHours;

    if (otRule.enforceCaps) {
      // Daily cap
      if (otRule.dailyCapHours) {
        const dailyCap = Number(otRule.dailyCapHours);
        if (cappedHours > dailyCap) {
          cappedHours = dailyCap;
        }
      }

      // Weekly cap: sum approved/pending OT for this employee in the same ISO week
      if (otRule.weeklyCapHours) {
        const weeklyCap = Number(otRule.weeklyCapHours);
        const recordDate = new Date(record.date);
        const companySettings = await getCachedCompanySettings(companyId);
        const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
        const dtRecord = DateTime.fromJSDate(recordDate).setZone(companyTimezone);
        const weekStart = dtRecord.startOf('week').toJSDate(); // Luxon week starts Monday
        const weekEnd = dtRecord.endOf('week').toJSDate();

        const weeklyOtAgg = await platformPrisma.overtimeRequest.aggregate({
          where: {
            companyId,
            employeeId: record.employeeId,
            date: { gte: weekStart, lte: weekEnd },
            status: { in: ['PENDING', 'APPROVED'] },
          },
          _sum: { requestedHours: true },
        });
        const weeklyOtSoFar = Number(weeklyOtAgg._sum.requestedHours ?? 0);
        const weeklyRemaining = Math.max(0, weeklyCap - weeklyOtSoFar);
        if (cappedHours > weeklyRemaining) {
          logger.info(`Weekly OT cap applied [employee=${record.employeeId}, weeklyUsed=${weeklyOtSoFar}h, cap=${weeklyCap}h, requested=${cappedHours}h, allowed=${weeklyRemaining}h]`);
          cappedHours = weeklyRemaining;
        }
      }

      // Monthly cap: sum approved/pending OT for this employee in the same month
      if (otRule.monthlyCapHours) {
        const monthlyCap = Number(otRule.monthlyCapHours);
        const recordDate = new Date(record.date);
        const companySettingsMonthly = await getCachedCompanySettings(companyId);
        const companyTimezoneMonthly = companySettingsMonthly.timezone ?? 'Asia/Kolkata';
        const dtRecordMonthly = DateTime.fromJSDate(recordDate).setZone(companyTimezoneMonthly);
        const monthStart = dtRecordMonthly.startOf('month').toJSDate();
        const monthEnd = dtRecordMonthly.endOf('month').toJSDate();

        const monthlyOtAgg = await platformPrisma.overtimeRequest.aggregate({
          where: {
            companyId,
            employeeId: record.employeeId,
            date: { gte: monthStart, lte: monthEnd },
            status: { in: ['PENDING', 'APPROVED'] },
          },
          _sum: { requestedHours: true },
        });
        const monthlyOtSoFar = Number(monthlyOtAgg._sum.requestedHours ?? 0);
        const monthlyRemaining = Math.max(0, monthlyCap - monthlyOtSoFar);
        if (cappedHours > monthlyRemaining) {
          logger.info(`Monthly OT cap applied [employee=${record.employeeId}, monthlyUsed=${monthlyOtSoFar}h, cap=${monthlyCap}h, requested=${cappedHours}h, allowed=${monthlyRemaining}h]`);
          cappedHours = monthlyRemaining;
        }
      }

      // maxContinuousOtHours: check cumulative OT across consecutive days
      if (otRule.maxContinuousOtHours) {
        const maxContinuous = Number(otRule.maxContinuousOtHours);
        const recordDate = new Date(record.date);

        // Look back up to 30 days to find continuous OT streak
        const lookbackStart = new Date(recordDate);
        lookbackStart.setDate(lookbackStart.getDate() - 30);

        const recentOtRecords = await platformPrisma.overtimeRequest.findMany({
          where: {
            companyId,
            employeeId: record.employeeId,
            date: { gte: lookbackStart, lt: recordDate },
            status: { in: ['PENDING', 'APPROVED'] },
          },
          select: { date: true, requestedHours: true },
          orderBy: { date: 'desc' },
        });

        // Build a map of OT hours by date string
        const otByDate = new Map<string, number>();
        for (const r of recentOtRecords) {
          const dateStr = new Date(r.date).toISOString().split('T')[0]!;
          otByDate.set(dateStr, (otByDate.get(dateStr) ?? 0) + Number(r.requestedHours));
        }

        // Walk backwards from yesterday to count continuous OT hours
        let continuousOtHours = 0;
        const checkDate = new Date(recordDate);
        checkDate.setDate(checkDate.getDate() - 1);

        while (true) {
          const dateStr = checkDate.toISOString().split('T')[0]!;
          const dayOt = otByDate.get(dateStr);
          if (!dayOt) break; // No OT on this day — streak broken
          continuousOtHours += dayOt;
          checkDate.setDate(checkDate.getDate() - 1);
        }

        const totalWithToday = continuousOtHours + cappedHours;
        if (totalWithToday > maxContinuous) {
          const allowed = Math.max(0, maxContinuous - continuousOtHours);
          logger.warn(`Continuous OT limit applied [employee=${record.employeeId}, streak=${continuousOtHours}h, today=${cappedHours}h, maxContinuous=${maxContinuous}h, allowed=${allowed}h]`);
          cappedHours = allowed;
        }
      }
    }

    // If all caps reduce OT to zero, skip creating the request
    if (cappedHours <= 0) {
      logger.info(`OT request skipped — capped to 0h [employee=${record.employeeId}]`);
      return;
    }

    // ── Determine multiplier source based on context ──
    // Night shift detection: check isCrossDay, shiftType, and shift start time heuristic
    let multiplierSource: OTMultiplierSource;
    let appliedMultiplier: number;

    const isNightShift = await this.detectNightShift(shiftInfo, record.shiftId);

    if (context.isHoliday) {
      multiplierSource = 'HOLIDAY';
      appliedMultiplier = otRule.holidayMultiplier ? Number(otRule.holidayMultiplier) : Number(otRule.weekdayMultiplier);
    } else if (context.isWeekOff) {
      multiplierSource = 'WEEKEND';
      appliedMultiplier = otRule.weekendMultiplier ? Number(otRule.weekendMultiplier) : Number(otRule.weekdayMultiplier);
    } else if (isNightShift) {
      multiplierSource = 'NIGHT_SHIFT';
      appliedMultiplier = otRule.nightShiftMultiplier ? Number(otRule.nightShiftMultiplier) : Number(otRule.weekdayMultiplier);
    } else {
      multiplierSource = 'WEEKDAY';
      appliedMultiplier = Number(otRule.weekdayMultiplier);
    }

    // Determine status based on approval requirements
    const status: OvertimeRequestStatus = otRule.approvalRequired ? 'PENDING' : 'APPROVED';

    // Create the OT request
    const otRequest = await platformPrisma.overtimeRequest.create({
      data: {
        attendanceRecordId: record.id,
        companyId,
        employeeId: record.employeeId,
        overtimeRuleId: otRule.id,
        date: record.date,
        requestedHours: cappedHours,
        appliedMultiplier,
        multiplierSource,
        status,
        requestedBy: record.employeeId,
        ...(status === 'APPROVED' && {
          approvedBy: 'SYSTEM',
          approvedAt: new Date(),
          approvalNotes: 'Auto-approved (approvalRequired=false)',
        }),
      },
    });

    logger.info(
      `OT request created [employee=${record.employeeId}, hours=${cappedHours}, basis=${otRule.calculationBasis}, multiplier=${appliedMultiplier}x (${multiplierSource}), status=${status}]`,
    );

    // Notify employee that OT was auto-detected
    notificationService.dispatch({
      companyId: record.companyId,
      triggerEvent: 'OVERTIME_AUTO_DETECTED',
      entityType: 'OvertimeRequest',
      entityId: otRequest.id,
      explicitRecipients: [record.employeeId],
      tokens: {
        employee_name: '',
        date: record.date.toISOString().split('T')[0],
        hours: cappedHours,
        multiplier_source: multiplierSource,
      },
      priority: 'LOW',
      type: 'OVERTIME',
      actionUrl: '/company/hr/my-overtime',
    }).catch((err: any) => logger.warn('Failed to dispatch OVERTIME_AUTO_DETECTED notification', err));

    return otRequest;
  }

  /**
   * Detect if a shift is a night shift by checking:
   * 1. isCrossDay flag on ShiftInfo
   * 2. ShiftType.NIGHT from the shift record in DB
   * 3. Heuristic: shift start time >= 20:00 (covers e.g. 22:00-23:30 non-cross-day)
   */
  private async detectNightShift(shiftInfo: ShiftInfo | null, shiftId: string | null): Promise<boolean> {
    if (shiftInfo?.isCrossDay) return true;

    if (shiftId) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: shiftId },
        select: { shiftType: true, startTime: true },
      });
      if (shift) {
        if (shift.shiftType === 'NIGHT') return true;
        const [hours] = shift.startTime.split(':').map(Number);
        if (hours !== undefined && hours >= 20) return true;
      }
    }

    return false;
  }

  /**
   * Apply OT-specific rounding strategy to OT hours.
   */
  private applyOtRounding(hours: number, strategy: string): number {
    switch (strategy) {
      case 'NEAREST_15':
        return Math.round(hours * 4) / 4;
      case 'NEAREST_30':
        return Math.round(hours * 2) / 2;
      case 'FLOOR_15':
        return Math.floor(hours * 4) / 4;
      case 'CEIL_15':
        return Math.ceil(hours * 4) / 4;
      case 'NONE':
      default:
        return Math.round(hours * 100) / 100;
    }
  }

  async updateRecord(companyId: string, id: string, data: any) {
    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { id },
      include: { employee: { select: { shiftId: true } } },
    });
    if (!record || record.companyId !== companyId) {
      throw ApiError.notFound('Attendance record not found');
    }

    // Check if payroll is locked for this record's month
    const recordDate = new Date(record.date);
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const dtRecord = DateTime.fromJSDate(recordDate).setZone(companyTimezone);
    const recordMonth = dtRecord.month;
    const recordYear = dtRecord.year;

    const payrollRun = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month: recordMonth, year: recordYear } },
    });

    if (payrollRun && payrollRun.status !== 'DRAFT') {
      throw ApiError.badRequest(
        `Cannot update record: attendance for ${recordMonth}/${recordYear} is locked for payroll processing (status: ${payrollRun.status})`
      );
    }

    // Recalculate metrics if punch times changed
    let metrics: any = {};
    const punchIn = data.punchIn !== undefined ? data.punchIn : record.punchIn?.toISOString();
    const punchOut = data.punchOut !== undefined ? data.punchOut : record.punchOut?.toISOString();
    const shiftId = data.shiftId !== undefined ? data.shiftId : record.shiftId;

    if (data.punchIn !== undefined || data.punchOut !== undefined) {
      const calcData = { ...data, punchIn, punchOut, shiftId };
      metrics = await this.calculateAttendanceMetrics(companyId, calcData, record.employee?.shiftId ?? null);
    }

    return platformPrisma.attendanceRecord.update({
      where: { id },
      data: {
        ...(data.shiftId !== undefined && { shiftId: n(data.shiftId) }),
        ...(data.punchIn !== undefined && { punchIn: data.punchIn ? new Date(data.punchIn) : null }),
        ...(data.punchOut !== undefined && { punchOut: data.punchOut ? new Date(data.punchOut) : null }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.source !== undefined && { source: data.source }),
        ...(data.remarks !== undefined && { remarks: n(data.remarks) }),
        ...(data.locationId !== undefined && { locationId: n(data.locationId) }),
        ...(metrics.workedHours !== undefined && { workedHours: metrics.workedHours }),
        ...(metrics.isLate !== undefined && { isLate: metrics.isLate }),
        ...(metrics.lateMinutes !== undefined && { lateMinutes: metrics.lateMinutes }),
        ...(metrics.isEarlyExit !== undefined && { isEarlyExit: metrics.isEarlyExit }),
        ...(metrics.earlyMinutes !== undefined && { earlyMinutes: metrics.earlyMinutes }),
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
  }

  async getSummary(companyId: string, date?: string) {
    const targetDate = date ? new Date(date) : new Date();
    // Normalize to start of day
    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    // Get counts grouped by status
    const statusCounts = await platformPrisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        companyId,
        date: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      _count: { status: true },
    });

    // Get late count
    const lateCount = await platformPrisma.attendanceRecord.count({
      where: {
        companyId,
        date: { gte: dayStart, lte: dayEnd },
        isLate: true,
      },
    });

    // Get total employees
    const totalEmployees = await platformPrisma.employee.count({
      where: { companyId, status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] } },
    });

    // Build summary map
    const summary: Record<string, number> = {
      total: totalEmployees,
      present: 0,
      absent: 0,
      halfDay: 0,
      late: lateCount,
      onLeave: 0,
      holiday: 0,
      weekOff: 0,
      lop: 0,
    };

    for (const row of statusCounts) {
      const key = row.status === 'PRESENT' ? 'present'
        : row.status === 'ABSENT' ? 'absent'
        : row.status === 'HALF_DAY' ? 'halfDay'
        : row.status === 'LATE' ? 'present' // LATE status counts toward present
        : row.status === 'ON_LEAVE' ? 'onLeave'
        : row.status === 'HOLIDAY' ? 'holiday'
        : row.status === 'WEEK_OFF' ? 'weekOff'
        : row.status === 'LOP' ? 'lop'
        : null;

      if (key) {
        summary[key] = (summary[key] ?? 0) + row._count.status;
      }
    }

    // Department-wise breakdown — fetch records with employee.department, group in JS
    const deptRecords = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        date: { gte: dayStart, lte: dayEnd },
        // departmentId is required on Employee, so all employees have a department
      },
      select: {
        status: true,
        employee: {
          select: {
            department: { select: { id: true, name: true } },
          },
        },
      },
    });

    const deptMap = new Map<string, { departmentId: string; departmentName: string; present: number; absent: number; onLeave: number; total: number }>();
    for (const rec of deptRecords) {
      const dept = rec.employee?.department;
      if (!dept) continue;
      if (!deptMap.has(dept.id)) {
        deptMap.set(dept.id, { departmentId: dept.id, departmentName: dept.name, present: 0, absent: 0, onLeave: 0, total: 0 });
      }
      const entry = deptMap.get(dept.id)!;
      entry.total++;
      if (rec.status === 'PRESENT' || rec.status === 'LATE') entry.present++;
      else if (rec.status === 'ABSENT') entry.absent++;
      else if (rec.status === 'ON_LEAVE') entry.onLeave++;
    }
    const departmentBreakdown = Array.from(deptMap.values()).sort((a, b) => a.departmentName.localeCompare(b.departmentName));

    return {
      date: dayStart.toISOString().split('T')[0],
      summary,
      departmentBreakdown,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Populate Month (auto-fill holidays & week-offs)
  // ────────────────────────────────────────────────────────────────────

  async populateMonthAttendance(companyId: string, month: number, year: number) {
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Get company timezone for accurate day-of-week resolution
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';

    // 1. Get all active employees for the company
    const employees = await platformPrisma.employee.findMany({
      where: { companyId, status: { in: ['ACTIVE', 'PROBATION', 'CONFIRMED'] } },
      select: { id: true },
    });

    if (employees.length === 0) {
      return { created: 0 };
    }

    // 2. Get the company's default roster for week-off days
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
    });
    const weekOff1 = roster?.weekOff1 ?? null;
    const weekOff2 = roster?.weekOff2 ?? null;

    // 3. Get all holidays for this month
    const dtMonth = DateTime.fromObject({ year, month }, { zone: companyTimezone });
    const monthStart = dtMonth.startOf('month').toJSDate();
    const monthEnd = dtMonth.endOf('month').toJSDate();
    const holidays = await platformPrisma.holidayCalendar.findMany({
      where: {
        companyId,
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { date: true },
    });

    // Build a Set of holiday date strings (YYYY-MM-DD) for fast lookup
    const holidayDates = new Set(
      holidays.map((h) => h.date.toISOString().split('T')[0])
    );

    // 4. Get all existing attendance records for the month to avoid overwriting
    const existingRecords = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { employeeId: true, date: true },
    });

    const existingKeys = new Set(
      existingRecords.map((r) => `${r.employeeId}_${r.date.toISOString().split('T')[0]}`)
    );

    // 5. Build the batch of records to create
    const daysInMonth = dtMonth.daysInMonth!;
    const recordsToCreate: Array<{
      companyId: string;
      employeeId: string;
      date: Date;
      status: AttendanceStatus;
      source: AttendanceSource;
    }> = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dtDay = DateTime.fromObject({ year, month, day }, { zone: companyTimezone });
      const date = dtDay.toJSDate();
      const dateStr = dtDay.toISODate()!;
      const dow = dayOfWeek[dtDay.weekday % 7];
      const isHoliday = holidayDates.has(dateStr);
      const isWeekOff = dow === weekOff1 || dow === weekOff2;

      if (!isHoliday && !isWeekOff) continue;

      const status: AttendanceStatus = isHoliday ? 'HOLIDAY' : 'WEEK_OFF';

      for (const emp of employees) {
        const key = `${emp.id}_${dateStr}`;
        if (existingKeys.has(key)) continue;

        recordsToCreate.push({
          companyId,
          employeeId: emp.id,
          date,
          status,
          source: 'MANUAL' as AttendanceSource,
        });
      }
    }

    if (recordsToCreate.length === 0) {
      return { created: 0 };
    }

    // 6. Batch create using createMany with skipDuplicates
    const result = await platformPrisma.attendanceRecord.createMany({
      data: recordsToCreate,
      skipDuplicates: true,
    });

    return { created: result.count };
  }

  // ────────────────────────────────────────────────────────────────────
  // Attendance Rules
  // ────────────────────────────────────────────────────────────────────

  async getRules(companyId: string) {
    let rules = await platformPrisma.attendanceRule.findUnique({
      where: { companyId },
    });

    if (!rules) {
      // Auto-seed with Prisma defaults
      logger.info(`AttendanceRule missing for company ${companyId}, auto-seeding defaults`);
      rules = await platformPrisma.attendanceRule.create({
        data: { companyId },
      });
    }

    return rules;
  }

  async updateRules(companyId: string, data: any, userId?: string) {
    const rules = await platformPrisma.attendanceRule.upsert({
      where: { companyId },
      create: {
        companyId,
        ...data,
        updatedBy: userId ?? null,
      },
      update: {
        // Time & Boundary
        ...(data.dayBoundaryTime !== undefined && { dayBoundaryTime: data.dayBoundaryTime }),

        // Grace & Tolerance
        ...(data.gracePeriodMinutes !== undefined && { gracePeriodMinutes: data.gracePeriodMinutes }),
        ...(data.earlyExitToleranceMinutes !== undefined && { earlyExitToleranceMinutes: data.earlyExitToleranceMinutes }),
        ...(data.maxLateCheckInMinutes !== undefined && { maxLateCheckInMinutes: data.maxLateCheckInMinutes }),

        // Day Classification Thresholds
        ...(data.halfDayThresholdHours !== undefined && { halfDayThresholdHours: data.halfDayThresholdHours }),
        ...(data.fullDayThresholdHours !== undefined && { fullDayThresholdHours: data.fullDayThresholdHours }),

        // Late Tracking
        ...(data.lateArrivalsAllowedPerMonth !== undefined && { lateArrivalsAllowedPerMonth: data.lateArrivalsAllowedPerMonth }),

        // Deduction Rules
        ...(data.lopAutoDeduct !== undefined && { lopAutoDeduct: data.lopAutoDeduct }),
        ...(data.lateDeductionType !== undefined && { lateDeductionType: data.lateDeductionType }),
        ...(data.lateDeductionValue !== undefined && { lateDeductionValue: n(data.lateDeductionValue) }),
        ...(data.earlyExitDeductionType !== undefined && { earlyExitDeductionType: data.earlyExitDeductionType }),
        ...(data.earlyExitDeductionValue !== undefined && { earlyExitDeductionValue: n(data.earlyExitDeductionValue) }),

        // Punch Interpretation
        ...(data.punchMode !== undefined && { punchMode: data.punchMode }),

        // Auto-Processing
        ...(data.autoMarkAbsentIfNoPunch !== undefined && { autoMarkAbsentIfNoPunch: data.autoMarkAbsentIfNoPunch }),
        ...(data.autoHalfDayEnabled !== undefined && { autoHalfDayEnabled: data.autoHalfDayEnabled }),
        ...(data.autoAbsentAfterDays !== undefined && { autoAbsentAfterDays: data.autoAbsentAfterDays }),
        ...(data.regularizationWindowDays !== undefined && { regularizationWindowDays: data.regularizationWindowDays }),

        // Rounding Rules
        ...(data.workingHoursRounding !== undefined && { workingHoursRounding: data.workingHoursRounding }),
        ...(data.punchTimeRounding !== undefined && { punchTimeRounding: data.punchTimeRounding }),
        ...(data.punchTimeRoundingDirection !== undefined && { punchTimeRoundingDirection: data.punchTimeRoundingDirection }),

        // Exception Handling
        ...(data.ignoreLateOnLeaveDay !== undefined && { ignoreLateOnLeaveDay: data.ignoreLateOnLeaveDay }),
        ...(data.ignoreLateOnHoliday !== undefined && { ignoreLateOnHoliday: data.ignoreLateOnHoliday }),
        ...(data.ignoreLateOnWeekOff !== undefined && { ignoreLateOnWeekOff: data.ignoreLateOnWeekOff }),

        // Capture Requirements
        ...(data.selfieRequired !== undefined && { selfieRequired: data.selfieRequired }),
        ...(data.gpsRequired !== undefined && { gpsRequired: data.gpsRequired }),
        ...(data.missingPunchAlert !== undefined && { missingPunchAlert: data.missingPunchAlert }),

        updatedBy: userId ?? null,
      },
    });

    await invalidateAttendanceRules(companyId);
    return rules;
  }

  // ────────────────────────────────────────────────────────────────────
  // Overrides / Regularization
  // ────────────────────────────────────────────────────────────────────

  async listOverrides(companyId: string, options: OverrideListOptions = {}) {
    const { page = 1, limit = 25, status } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (status) {
      where.status = status;
    }

    const [overrides, total] = await Promise.all([
      platformPrisma.attendanceOverride.findMany({
        where,
        include: {
          attendanceRecord: {
            include: {
              employee: {
                select: {
                  id: true,
                  employeeId: true,
                  firstName: true,
                  lastName: true,
                  department: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.attendanceOverride.count({ where }),
    ]);

    return { overrides, total, page, limit };
  }

  async createOverride(companyId: string, userId: string, data: any) {
    // Verify attendance record belongs to company
    const record = await platformPrisma.attendanceRecord.findUnique({
      where: { id: data.attendanceRecordId },
    });
    if (!record || record.companyId !== companyId) {
      throw ApiError.notFound('Attendance record not found');
    }

    // Enforce regularization window — prevent overrides for dates older than N days
    const rules = await getCachedAttendanceRules(companyId);
    const windowDays = rules.regularizationWindowDays ?? 7;
    if (windowDays > 0) {
      const recordDate = DateTime.fromJSDate(new Date(record.date)).startOf('day');
      const cutoff = DateTime.now().startOf('day').minus({ days: windowDays });
      if (recordDate < cutoff) {
        throw ApiError.badRequest(
          `Cannot create override: attendance date is older than the ${windowDays}-day regularization window`
        );
      }
    }

    // Check if payroll is locked for this record's month
    const recordDate = new Date(record.date);
    const companySettingsOverride = await getCachedCompanySettings(companyId);
    const companyTimezoneOverride = companySettingsOverride.timezone ?? 'Asia/Kolkata';
    const dtRecordOverride = DateTime.fromJSDate(recordDate).setZone(companyTimezoneOverride);
    const recordMonth = dtRecordOverride.month;
    const recordYear = dtRecordOverride.year;

    const payrollRun = await platformPrisma.payrollRun.findUnique({
      where: { companyId_month_year: { companyId, month: recordMonth, year: recordYear } },
    });

    if (payrollRun && payrollRun.status !== 'DRAFT') {
      throw ApiError.badRequest(
        `Cannot create override: attendance for ${recordMonth}/${recordYear} is locked for payroll processing (status: ${payrollRun.status})`
      );
    }

    return platformPrisma.attendanceOverride.create({
      data: {
        companyId,
        attendanceRecordId: data.attendanceRecordId,
        issueType: data.issueType,
        correctedPunchIn: data.correctedPunchIn ? new Date(data.correctedPunchIn) : null,
        correctedPunchOut: data.correctedPunchOut ? new Date(data.correctedPunchOut) : null,
        reason: data.reason,
        requestedBy: userId,
        status: 'PENDING',
      },
      include: {
        attendanceRecord: {
          include: {
            employee: {
              select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });
  }

  async processOverride(companyId: string, overrideId: string, userId: string, status: 'APPROVED' | 'REJECTED') {
    const override = await platformPrisma.attendanceOverride.findUnique({
      where: { id: overrideId },
      include: { attendanceRecord: true },
    });

    if (!override || override.companyId !== companyId) {
      throw ApiError.notFound('Override request not found');
    }

    if (override.status !== 'PENDING') {
      throw ApiError.badRequest('Override request has already been processed');
    }

    // Update the override
    const updatedOverride = await platformPrisma.attendanceOverride.update({
      where: { id: overrideId },
      data: {
        status,
        approvedBy: userId,
      },
    });

    // If approved, update the parent attendance record using the full status resolver
    if (status === 'APPROVED') {
      const record = override.attendanceRecord;
      const updateData: any = {};

      if (override.correctedPunchIn) {
        updateData.punchIn = override.correctedPunchIn;
      }
      if (override.correctedPunchOut) {
        updateData.punchOut = override.correctedPunchOut;
      }

      // Resolve new punch times
      const newPunchIn = override.correctedPunchIn ?? record.punchIn;
      const newPunchOut = override.correctedPunchOut ?? record.punchOut;

      // Re-evaluate using the full attendance status resolver (same as createRecord)
      if (newPunchIn && newPunchOut) {
        const effectiveShiftId = record.shiftId;
        const attendanceDate = new Date(record.date);
        const dateStr = attendanceDate.toISOString().split('T')[0]!;

        // Build evaluation context
        const holiday = await platformPrisma.holidayCalendar.findFirst({
          where: { companyId, date: attendanceDate },
          select: { name: true },
        });

        const roster = await platformPrisma.roster.findFirst({
          where: { companyId, isDefault: true },
          select: { weekOff1: true, weekOff2: true },
        });
        // Get company timezone
        const companySettings = await getCachedCompanySettings(companyId);
        const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';

        const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dtAttOverride = DateTime.fromJSDate(attendanceDate).setZone(companyTimezone);
        const dow = dayOfWeek[dtAttOverride.weekday % 7];
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

        // Fetch shift info
        let shiftInfo: ShiftInfo | null = null;
        if (effectiveShiftId) {
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

        // Fetch attendance rules
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

        // Run the full status resolver
        const statusResult = resolveAttendanceStatus(
          newPunchIn,
          newPunchOut,
          shiftInfo,
          policy,
          evaluationContext,
          rulesInput,
          companyTimezone,
        );

        updateData.workedHours = statusResult.workedHours;
        updateData.status = statusResult.status;
        updateData.isLate = statusResult.isLate;
        updateData.lateMinutes = statusResult.lateMinutes || null;
        updateData.isEarlyExit = statusResult.isEarlyExit;
        updateData.earlyMinutes = statusResult.earlyMinutes || null;
        updateData.overtimeHours = statusResult.overtimeHours > 0 ? statusResult.overtimeHours : null;
        updateData.appliedLateDeduction = statusResult.appliedLateDeduction;
        updateData.appliedEarlyExitDeduction = statusResult.appliedEarlyExitDeduction;
        updateData.finalStatusReason = statusResult.finalStatusReason;
      }

      // Handle absent override — mark as present
      if (override.issueType === 'ABSENT_OVERRIDE') {
        updateData.status = 'PRESENT';
        updateData.finalStatusReason = 'Regularized: absent override approved';
      }

      // Handle late override — clear late flag and deduction
      if (override.issueType === 'LATE_OVERRIDE') {
        updateData.isLate = false;
        updateData.lateMinutes = 0;
        updateData.appliedLateDeduction = null;
        updateData.finalStatusReason = 'Regularized: late override approved';
        // If status was LATE, upgrade to PRESENT
        if (updateData.status === 'LATE' || record.status === 'LATE') {
          updateData.status = 'PRESENT';
        }
      }

      // Mark as regularized
      updateData.isRegularized = true;
      updateData.regularizedAt = new Date();
      updateData.regularizedBy = userId;
      updateData.regularizationReason = override.reason;

      if (Object.keys(updateData).length > 0) {
        await platformPrisma.attendanceRecord.update({
          where: { id: record.id },
          data: updateData,
        });
      }
    }

    return updatedOverride;
  }

  // ────────────────────────────────────────────────────────────────────
  // Holiday Calendar
  // ────────────────────────────────────────────────────────────────────

  async listHolidays(companyId: string, options: HolidayListOptions = {}) {
    const { page = 1, limit = 50, year, type } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (year) where.year = year;
    if (type) where.type = type;

    const [holidays, total] = await Promise.all([
      platformPrisma.holidayCalendar.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { date: 'asc' },
      }),
      platformPrisma.holidayCalendar.count({ where }),
    ]);

    return { holidays, total, page, limit };
  }

  async createHoliday(companyId: string, data: any) {
    // Validate unique name+date
    const existing = await platformPrisma.holidayCalendar.findUnique({
      where: {
        companyId_name_date: {
          companyId,
          name: data.name,
          date: new Date(data.date),
        },
      },
    });
    if (existing) {
      throw ApiError.conflict(`Holiday "${data.name}" already exists on this date`);
    }

    return platformPrisma.holidayCalendar.create({
      data: {
        companyId,
        name: data.name,
        date: new Date(data.date),
        type: data.type,
        branchIds: data.branchIds ?? Prisma.JsonNull,
        year: data.year,
        description: n(data.description),
        isOptional: data.isOptional ?? false,
        maxOptionalSlots: n(data.maxOptionalSlots),
      },
    });
  }

  async updateHoliday(companyId: string, id: string, data: any) {
    const holiday = await platformPrisma.holidayCalendar.findUnique({ where: { id } });
    if (!holiday || holiday.companyId !== companyId) {
      throw ApiError.notFound('Holiday not found');
    }

    return platformPrisma.holidayCalendar.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.date !== undefined && { date: new Date(data.date) }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.branchIds !== undefined && { branchIds: data.branchIds ?? Prisma.JsonNull }),
        ...(data.year !== undefined && { year: data.year }),
        ...(data.description !== undefined && { description: n(data.description) }),
        ...(data.isOptional !== undefined && { isOptional: data.isOptional }),
        ...(data.maxOptionalSlots !== undefined && { maxOptionalSlots: n(data.maxOptionalSlots) }),
      },
    });
  }

  async deleteHoliday(companyId: string, id: string) {
    const holiday = await platformPrisma.holidayCalendar.findUnique({ where: { id } });
    if (!holiday || holiday.companyId !== companyId) {
      throw ApiError.notFound('Holiday not found');
    }

    await platformPrisma.holidayCalendar.delete({ where: { id } });
    return { message: 'Holiday deleted' };
  }

  async cloneHolidays(companyId: string, fromYear: number, toYear: number) {
    if (fromYear === toYear) {
      throw ApiError.badRequest('Source and target years must be different');
    }

    const sourceHolidays = await platformPrisma.holidayCalendar.findMany({
      where: { companyId, year: fromYear },
    });

    if (sourceHolidays.length === 0) {
      throw ApiError.notFound(`No holidays found for year ${fromYear}`);
    }

    // Check for existing holidays in target year
    const existingCount = await platformPrisma.holidayCalendar.count({
      where: { companyId, year: toYear },
    });
    if (existingCount > 0) {
      throw ApiError.conflict(`Holidays already exist for year ${toYear}. Delete them first or choose a different year.`);
    }

    const yearDiff = toYear - fromYear;

    const clonedHolidays = await platformPrisma.$transaction(
      sourceHolidays.map((holiday) => {
        const newDate = new Date(holiday.date);
        newDate.setFullYear(newDate.getFullYear() + yearDiff);

        return platformPrisma.holidayCalendar.create({
          data: {
            companyId,
            name: holiday.name,
            date: newDate,
            type: holiday.type,
            branchIds: holiday.branchIds ?? Prisma.JsonNull,
            year: toYear,
            description: holiday.description,
            isOptional: holiday.isOptional,
            maxOptionalSlots: holiday.maxOptionalSlots,
          },
        });
      })
    );

    return { cloned: clonedHolidays.length, holidays: clonedHolidays };
  }

  // ────────────────────────────────────────────────────────────────────
  // Rosters
  // ────────────────────────────────────────────────────────────────────

  async listRosters(companyId: string) {
    return platformPrisma.roster.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async createRoster(companyId: string, data: any) {
    // Validate day name values
    const VALID_DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    if (data.weekOff1 && !VALID_DAYS.includes(data.weekOff1.toUpperCase())) {
      throw ApiError.badRequest(`Invalid weekOff1 value: ${data.weekOff1}. Must be one of: ${VALID_DAYS.join(', ')}`);
    }
    if (data.weekOff2 && !VALID_DAYS.includes(data.weekOff2.toUpperCase())) {
      throw ApiError.badRequest(`Invalid weekOff2 value: ${data.weekOff2}. Must be one of: ${VALID_DAYS.join(', ')}`);
    }

    // Validate weekOff1 != weekOff2 when both are provided
    if (data.weekOff1 && data.weekOff2 && data.weekOff1.toUpperCase() === data.weekOff2.toUpperCase()) {
      throw ApiError.badRequest('weekOff1 and weekOff2 must be different days');
    }

    // Validate applicableTypeIds if provided (must be non-empty array of strings)
    if (data.applicableTypeIds !== undefined && data.applicableTypeIds !== null) {
      if (!Array.isArray(data.applicableTypeIds) || data.applicableTypeIds.length === 0) {
        throw ApiError.badRequest('applicableTypeIds must be a non-empty array when provided');
      }
    }

    // Validate unique name
    const existing = await platformPrisma.roster.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Roster "${data.name}" already exists`);
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await platformPrisma.roster.updateMany({
        where: { companyId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return platformPrisma.roster.create({
      data: {
        companyId,
        name: data.name,
        pattern: data.pattern,
        weekOff1: n(data.weekOff1),
        weekOff2: n(data.weekOff2),
        applicableTypeIds: data.applicableTypeIds ?? Prisma.JsonNull,
        effectiveFrom: new Date(data.effectiveFrom),
        isDefault: data.isDefault ?? false,
      },
    });
  }

  async updateRoster(companyId: string, id: string, data: any) {
    const roster = await platformPrisma.roster.findUnique({ where: { id } });
    if (!roster || roster.companyId !== companyId) {
      throw ApiError.notFound('Roster not found');
    }

    // If name is changing, check uniqueness
    if (data.name && data.name !== roster.name) {
      const existing = await platformPrisma.roster.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (existing) {
        throw ApiError.conflict(`Roster "${data.name}" already exists`);
      }
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      await platformPrisma.roster.updateMany({
        where: { companyId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    return platformPrisma.roster.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.pattern !== undefined && { pattern: data.pattern }),
        ...(data.weekOff1 !== undefined && { weekOff1: n(data.weekOff1) }),
        ...(data.weekOff2 !== undefined && { weekOff2: n(data.weekOff2) }),
        ...(data.applicableTypeIds !== undefined && { applicableTypeIds: data.applicableTypeIds ?? Prisma.JsonNull }),
        ...(data.effectiveFrom !== undefined && { effectiveFrom: new Date(data.effectiveFrom) }),
        ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      },
    });
  }

  async deleteRoster(companyId: string, id: string) {
    const roster = await platformPrisma.roster.findUnique({ where: { id } });
    if (!roster || roster.companyId !== companyId) {
      throw ApiError.notFound('Roster not found');
    }

    await platformPrisma.roster.delete({ where: { id } });
    return { message: 'Roster deleted' };
  }

  // ────────────────────────────────────────────────────────────────────
  // Overtime Rules (enhanced — 20 fields per spec Screen 5)
  // ────────────────────────────────────────────────────────────────────

  async getOvertimeRules(companyId: string) {
    let rules = await platformPrisma.overtimeRule.findUnique({
      where: { companyId },
    });

    if (!rules) {
      logger.info(`OvertimeRule missing for company ${companyId}, auto-seeding defaults`);
      rules = await platformPrisma.overtimeRule.create({
        data: { companyId },
      });
    }

    return rules;
  }

  async updateOvertimeRules(companyId: string, data: any, userId?: string) {
    const rules = await platformPrisma.overtimeRule.upsert({
      where: { companyId },
      create: {
        companyId,
        ...data,
        eligibleTypeIds: data.eligibleTypeIds !== undefined ? (data.eligibleTypeIds ?? Prisma.JsonNull) : Prisma.JsonNull,
        updatedBy: userId ?? null,
      },
      update: {
        // Eligibility
        ...(data.eligibleTypeIds !== undefined && { eligibleTypeIds: data.eligibleTypeIds ?? Prisma.JsonNull }),

        // Calculation Basis
        ...(data.calculationBasis !== undefined && { calculationBasis: data.calculationBasis }),
        ...(data.thresholdMinutes !== undefined && { thresholdMinutes: data.thresholdMinutes }),
        ...(data.minimumOtMinutes !== undefined && { minimumOtMinutes: data.minimumOtMinutes }),
        ...(data.includeBreaksInOT !== undefined && { includeBreaksInOT: data.includeBreaksInOT }),

        // Rate Multipliers
        ...(data.weekdayMultiplier !== undefined && { weekdayMultiplier: data.weekdayMultiplier }),
        ...(data.weekendMultiplier !== undefined && { weekendMultiplier: n(data.weekendMultiplier) }),
        ...(data.holidayMultiplier !== undefined && { holidayMultiplier: n(data.holidayMultiplier) }),
        ...(data.nightShiftMultiplier !== undefined && { nightShiftMultiplier: n(data.nightShiftMultiplier) }),

        // Caps
        ...(data.dailyCapHours !== undefined && { dailyCapHours: n(data.dailyCapHours) }),
        ...(data.weeklyCapHours !== undefined && { weeklyCapHours: n(data.weeklyCapHours) }),
        ...(data.monthlyCapHours !== undefined && { monthlyCapHours: n(data.monthlyCapHours) }),
        ...(data.enforceCaps !== undefined && { enforceCaps: data.enforceCaps }),
        ...(data.maxContinuousOtHours !== undefined && { maxContinuousOtHours: n(data.maxContinuousOtHours) }),

        // Approval & Payroll
        ...(data.approvalRequired !== undefined && { approvalRequired: data.approvalRequired }),
        ...(data.autoIncludePayroll !== undefined && { autoIncludePayroll: data.autoIncludePayroll }),

        // Comp-Off
        ...(data.compOffEnabled !== undefined && { compOffEnabled: data.compOffEnabled }),
        ...(data.compOffExpiryDays !== undefined && { compOffExpiryDays: n(data.compOffExpiryDays) }),

        // Rounding
        ...(data.roundingStrategy !== undefined && { roundingStrategy: data.roundingStrategy }),

        updatedBy: userId ?? null,
      },
    });

    await invalidateOvertimeRules(companyId);
    return rules;
  }

  // ────────────────────────────────────────────────────────────────────
  // Overtime Requests (approval workflow)
  // ────────────────────────────────────────────────────────────────────

  async listOvertimeRequests(companyId: string, options: OvertimeRequestListOptions = {}) {
    const { page = 1, limit = 25, status, employeeId, dateFrom, dateTo } = options;
    const offset = (page - 1) * limit;

    const where: any = { companyId };
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    if (dateFrom || dateTo) {
      where.date = {};
      if (dateFrom) where.date.gte = new Date(dateFrom);
      if (dateTo) where.date.lte = new Date(dateTo);
    }

    const [requests, total] = await Promise.all([
      platformPrisma.overtimeRequest.findMany({
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
          attendanceRecord: {
            select: {
              id: true,
              date: true,
              punchIn: true,
              punchOut: true,
              workedHours: true,
              overtimeHours: true,
              shift: { select: { id: true, name: true } },
            },
          },
        },
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      platformPrisma.overtimeRequest.count({ where }),
    ]);

    return { requests, total, page, limit };
  }

  async approveOvertimeRequest(companyId: string, id: string, userId: string, notes?: string) {
    const request = await platformPrisma.overtimeRequest.findUnique({
      where: { id },
    });

    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Overtime request not found');
    }
    if (request.status !== 'PENDING') {
      throw ApiError.badRequest(`Cannot approve: request is already ${request.status}`);
    }

    // Fetch employee salary for OT amount calculation
    const salary = await platformPrisma.employeeSalary.findFirst({
      where: { employeeId: request.employeeId, isCurrent: true },
      select: { monthlyGross: true, annualCtc: true, components: true },
    });

    // Calculate amount based on employee salary + applied multiplier
    let calculatedAmount: number | null = null;
    if (salary) {
      const monthlyGross = Number(salary.monthlyGross ?? 0) || Number(salary.annualCtc) / 12;
      const components = salary.components as Record<string, number> | null;

      // Use basic component or fall back to monthly gross
      let basicAmount = 0;
      if (components) {
        const basicEntry = Object.entries(components).find(([code]) =>
          code.toLowerCase().includes('basic')
        );
        basicAmount = basicEntry ? basicEntry[1] : monthlyGross;
      } else {
        basicAmount = monthlyGross;
      }

      // Fetch attendance rules for full day threshold
      const attendanceRules = await getCachedAttendanceRules(companyId);
      const workHoursPerDay = attendanceRules.fullDayThresholdHours
        ? Number(attendanceRules.fullDayThresholdHours)
        : 8;

      const totalWorkingDays = 26; // Standard assumption
      const ratePerHour = (basicAmount / totalWorkingDays) / workHoursPerDay;
      calculatedAmount = Math.round(Number(request.requestedHours) * ratePerHour * Number(request.appliedMultiplier) * 100) / 100;
    }

    const updated = await platformPrisma.overtimeRequest.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: userId,
        approvedAt: new Date(),
        approvalNotes: notes ?? null,
        calculatedAmount,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    logger.info(`Overtime request ${id} approved by ${userId}, amount: ${calculatedAmount}`);

    // Grant comp-off leave balance if company has compOffEnabled
    try {
      const otRules = await getCachedOvertimeRules(companyId);
      if (otRules.compOffEnabled) {
        const compOffType = await platformPrisma.leaveType.findFirst({
          where: { companyId, category: 'COMPENSATORY', isActive: true },
        });

        if (compOffType) {
          const companySettingsOt = await getCachedCompanySettings(companyId);
          const companyTimezoneOt = companySettingsOt.timezone ?? 'Asia/Kolkata';
          const otYear = DateTime.fromJSDate(new Date(request.date)).setZone(companyTimezoneOt).year;
          const attendanceRulesForCompOff = await getCachedAttendanceRules(companyId);
          const fullDayHours = attendanceRulesForCompOff.fullDayThresholdHours
            ? Number(attendanceRulesForCompOff.fullDayThresholdHours)
            : 8;
          const credit = Number(request.requestedHours) >= fullDayHours ? 1 : 0.5;

          // Calculate comp-off expiry date if compOffExpiryDays is configured
          let expiresAt: Date | undefined;
          if (otRules.compOffExpiryDays) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + Number(otRules.compOffExpiryDays));
          }

          const existingBalance = await platformPrisma.leaveBalance.findUnique({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: request.employeeId,
                leaveTypeId: compOffType.id,
                year: otYear,
              },
            },
          });

          if (existingBalance) {
            await platformPrisma.leaveBalance.update({
              where: { id: existingBalance.id },
              data: {
                accrued: { increment: credit },
                balance: { increment: credit },
                // Extend expiry to the latest comp-off grant's expiry window
                ...(expiresAt ? { expiresAt } : {}),
              },
            });
          } else {
            await platformPrisma.leaveBalance.create({
              data: {
                companyId,
                employeeId: request.employeeId,
                leaveTypeId: compOffType.id,
                year: otYear,
                accrued: credit,
                taken: 0,
                balance: credit,
                ...(expiresAt ? { expiresAt } : {}),
              },
            });
          }

          // Mark comp-off as granted on the OT request
          await platformPrisma.overtimeRequest.update({
            where: { id },
            data: { compOffGranted: true },
          });

          logger.info(`Comp-off ${credit} day(s) credited for employee ${request.employeeId} from OT request ${id}`);

          // Notify employee about comp-off grant
          const compOffRequesterUserId = await getRequesterUserId({ employeeId: request.employeeId });
          if (compOffRequesterUserId) {
            const compOffEmployeeName = `${updated.employee?.firstName ?? ''} ${updated.employee?.lastName ?? ''}`.trim();
            const compOffBalance = existingBalance ? Number(existingBalance.balance) + credit : credit;
            notificationService.dispatch({
              companyId,
              triggerEvent: 'COMP_OFF_GRANTED',
              entityType: 'OvertimeRequest',
              entityId: id,
              explicitRecipients: [compOffRequesterUserId],
              tokens: {
                employee_name: compOffEmployeeName,
                days: credit,
                date: new Date(request.date).toISOString().split('T')[0],
                expires_at: expiresAt ? expiresAt.toISOString().split('T')[0] : '',
                balance: compOffBalance,
              },
              priority: 'MEDIUM',
              type: 'OVERTIME',
              actionUrl: '/company/hr/my-overtime',
            }).catch((err: any) => logger.warn('Failed to dispatch COMP_OFF_GRANTED notification', err));
          }
        }
      }
    } catch (err) {
      // Log but don't fail the approval — comp-off grant is secondary
      logger.error(`Failed to grant comp-off for OT request ${id}:`, err);
    }

    // Non-blocking dispatch — direct approve bypasses ApprovalRequest/
    // onApprovalComplete so we notify the requester inline.
    try {
      const requesterUserId = await getRequesterUserId({ employeeId: request.employeeId });
      if (requesterUserId) {
        const employeeName = `${updated.employee?.firstName ?? ''} ${updated.employee?.lastName ?? ''}`.trim();
        await notificationService.dispatch({
          companyId,
          triggerEvent: 'OVERTIME_CLAIM_APPROVED',
          entityType: 'OvertimeRequest',
          entityId: id,
          explicitRecipients: [requesterUserId],
          tokens: {
            employee_name: employeeName,
            date: new Date(request.date).toISOString().slice(0, 10),
            hours: Number(request.requestedHours),
            amount: calculatedAmount ?? 0,
          },
          priority: 'MEDIUM',
          type: 'OVERTIME',
          actionUrl: `/company/hr/my-overtime`,
        });
      }
    } catch (err) {
      logger.warn('Overtime approval dispatch failed (non-blocking)', { error: err, overtimeRequestId: id });
    }

    return updated;
  }

  async rejectOvertimeRequest(companyId: string, id: string, userId: string, notes: string) {
    const request = await platformPrisma.overtimeRequest.findUnique({
      where: { id },
    });

    if (!request || request.companyId !== companyId) {
      throw ApiError.notFound('Overtime request not found');
    }
    if (request.status !== 'PENDING') {
      throw ApiError.badRequest(`Cannot reject: request is already ${request.status}`);
    }

    const updated = await platformPrisma.overtimeRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedBy: userId,
        approvedAt: new Date(),
        approvalNotes: notes,
      },
      include: {
        employee: {
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    logger.info(`Overtime request ${id} rejected by ${userId}, reason: ${notes}`);

    // Non-blocking dispatch to the requester.
    try {
      const requesterUserId = await getRequesterUserId({ employeeId: request.employeeId });
      if (requesterUserId) {
        const employeeName = `${updated.employee?.firstName ?? ''} ${updated.employee?.lastName ?? ''}`.trim();
        await notificationService.dispatch({
          companyId,
          triggerEvent: 'OVERTIME_CLAIM_REJECTED',
          entityType: 'OvertimeRequest',
          entityId: id,
          explicitRecipients: [requesterUserId],
          tokens: {
            employee_name: employeeName,
            date: new Date(request.date).toISOString().slice(0, 10),
            hours: Number(request.requestedHours),
            reason: notes,
          },
          priority: 'MEDIUM',
          type: 'OVERTIME',
          actionUrl: `/company/hr/my-overtime`,
        });
      }
    } catch (err) {
      logger.warn('Overtime rejection dispatch failed (non-blocking)', { error: err, overtimeRequestId: id });
    }

    return updated;
  }

  // ────────────────────────────────────────────────────────────────────
  // Comp-Off Auto-Accrual
  // ────────────────────────────────────────────────────────────────────

  async processCompOffAccrual(companyId: string, month: number, year: number) {
    // 1. Find the COMPENSATORY leave type
    const compOffType = await platformPrisma.leaveType.findFirst({
      where: { companyId, category: 'COMPENSATORY', isActive: true },
    });

    if (!compOffType) {
      return { accrued: 0, message: 'No active COMPENSATORY leave type found for this company' };
    }

    // 2. Get all holiday dates for the month
    const companySettings = await getCachedCompanySettings(companyId);
    const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';
    const dtMonth = DateTime.fromObject({ year, month }, { zone: companyTimezone });
    const monthStart = dtMonth.startOf('month').toJSDate();
    const monthEnd = dtMonth.endOf('month').toJSDate();

    const holidays = await platformPrisma.holidayCalendar.findMany({
      where: {
        companyId,
        date: { gte: monthStart, lte: monthEnd },
      },
      select: { date: true },
    });

    const holidayDates = new Set(
      holidays.map((h) => h.date.toISOString().split('T')[0])
    );

    // 3. Get the company's default roster to identify week-off days
    const roster = await platformPrisma.roster.findFirst({
      where: { companyId, isDefault: true },
    });
    const weekOff1 = roster?.weekOff1 ?? null;
    const weekOff2 = roster?.weekOff2 ?? null;

    // 4. Build a Set of all off-day dates (holidays + week-offs) for the month
    const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const offDayDates = new Set<string>();

    const daysInMonth = dtMonth.daysInMonth!;
    for (let day = 1; day <= daysInMonth; day++) {
      const dtDay = DateTime.fromObject({ year, month, day }, { zone: companyTimezone });
      const date = dtDay.toJSDate();
      const dateStr = dtDay.toISODate()!;
      const dow = dayOfWeek[dtDay.weekday % 7];

      if (holidayDates.has(dateStr) || dow === weekOff1 || dow === weekOff2) {
        offDayDates.add(dateStr);
      }
    }

    if (offDayDates.size === 0) {
      return { accrued: 0, message: 'No off-days (holidays or week-offs) found for this month' };
    }

    // 5. Find attendance records where employees were PRESENT or LATE on off-day dates
    const offDayDateArray = Array.from(offDayDates).map((d) => new Date(d));

    const presentOnOffDays = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        date: { in: offDayDateArray },
        status: { in: ['PRESENT', 'LATE'] },
      },
      select: {
        id: true,
        employeeId: true,
        workedHours: true,
      },
    });

    if (presentOnOffDays.length === 0) {
      return { accrued: 0, message: 'No employees found working on off-days this month' };
    }

    // 6. Get attendance rules for half-day threshold
    const rules = await this.getRules(companyId);
    const fullDayThreshold = rules.fullDayThresholdHours ? Number(rules.fullDayThresholdHours) : 8;

    // 7. For each record, credit comp-off leave balance
    let accruedCount = 0;

    for (const record of presentOnOffDays) {
      const workedHours = record.workedHours ? Number(record.workedHours) : 0;
      const credit = workedHours >= fullDayThreshold ? 1 : 0.5;

      // Find or create leave balance for this employee + comp-off type + year
      const existingBalance = await platformPrisma.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: record.employeeId,
            leaveTypeId: compOffType.id,
            year,
          },
        },
      });

      if (existingBalance) {
        await platformPrisma.leaveBalance.update({
          where: { id: existingBalance.id },
          data: {
            accrued: { increment: credit },
            balance: { increment: credit },
          },
        });
      } else {
        await platformPrisma.leaveBalance.create({
          data: {
            companyId,
            employeeId: record.employeeId,
            leaveTypeId: compOffType.id,
            year,
            accrued: credit,
            taken: 0,
            balance: credit,
          },
        });
      }

      accruedCount++;
    }

    return {
      accrued: accruedCount,
      message: `Comp-off accrual processed: ${accruedCount} record(s) credited for ${month}/${year}`,
    };
  }

  // ────────────────────────────────────────────────────────────────────
  // Biometric Devices (YEL-7)
  // ────────────────────────────────────────────────────────────────────

  async listDevices(companyId: string) {
    return platformPrisma.biometricDevice.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    });
  }

  async createDevice(companyId: string, data: any) {
    // Validate unique deviceId per company
    const existing = await platformPrisma.biometricDevice.findUnique({
      where: { companyId_deviceId: { companyId, deviceId: data.deviceId } },
    });
    if (existing) {
      throw ApiError.conflict(`Device with ID "${data.deviceId}" already exists`);
    }

    return platformPrisma.biometricDevice.create({
      data: {
        companyId,
        name: data.name,
        brand: data.brand,
        deviceId: data.deviceId,
        ipAddress: n(data.ipAddress),
        port: n(data.port),
        syncMode: data.syncMode ?? 'MANUAL',
        syncIntervalMin: n(data.syncIntervalMin),
        locationId: n(data.locationId),
        status: 'ACTIVE',
      },
    });
  }

  async updateDevice(companyId: string, id: string, data: any) {
    const device = await platformPrisma.biometricDevice.findUnique({ where: { id } });
    if (!device || device.companyId !== companyId) {
      throw ApiError.notFound('Biometric device not found');
    }

    // If deviceId is changing, check uniqueness
    if (data.deviceId && data.deviceId !== device.deviceId) {
      const existing = await platformPrisma.biometricDevice.findUnique({
        where: { companyId_deviceId: { companyId, deviceId: data.deviceId } },
      });
      if (existing) {
        throw ApiError.conflict(`Device with ID "${data.deviceId}" already exists`);
      }
    }

    return platformPrisma.biometricDevice.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.brand !== undefined && { brand: data.brand }),
        ...(data.deviceId !== undefined && { deviceId: data.deviceId }),
        ...(data.ipAddress !== undefined && { ipAddress: n(data.ipAddress) }),
        ...(data.port !== undefined && { port: n(data.port) }),
        ...(data.syncMode !== undefined && { syncMode: data.syncMode }),
        ...(data.syncIntervalMin !== undefined && { syncIntervalMin: n(data.syncIntervalMin) }),
        ...(data.locationId !== undefined && { locationId: n(data.locationId) }),
      },
    });
  }

  async deleteDevice(companyId: string, id: string) {
    const device = await platformPrisma.biometricDevice.findUnique({ where: { id } });
    if (!device || device.companyId !== companyId) {
      throw ApiError.notFound('Biometric device not found');
    }

    await platformPrisma.biometricDevice.delete({ where: { id } });
    return { message: 'Biometric device deleted' };
  }

  async testDeviceConnection(companyId: string, id: string) {
    const device = await platformPrisma.biometricDevice.findUnique({ where: { id } });
    if (!device || device.companyId !== companyId) {
      throw ApiError.notFound('Biometric device not found');
    }

    // Ping placeholder — mark ACTIVE if ipAddress exists, OFFLINE otherwise
    const newStatus = device.ipAddress ? 'ACTIVE' : 'OFFLINE';

    const updated = await platformPrisma.biometricDevice.update({
      where: { id },
      data: { status: newStatus },
    });

    return { device: updated, status: newStatus, message: `Device is ${newStatus}` };
  }

  async syncDeviceAttendance(companyId: string, id: string, records: any[]) {
    const device = await platformPrisma.biometricDevice.findUnique({ where: { id } });
    if (!device || device.companyId !== companyId) {
      throw ApiError.notFound('Biometric device not found');
    }

    let synced = 0;
    let errors = 0;
    const errorDetails: Array<{ index: number; employeeId: string; error: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      try {
        await this.createRecord(companyId, {
          employeeId: rec.employeeId,
          date: rec.date,
          punchIn: rec.punchIn,
          punchOut: rec.punchOut,
          status: 'PRESENT',
          source: 'BIOMETRIC',
          locationId: device.locationId,
        });
        synced++;
      } catch (err: any) {
        errors++;
        errorDetails.push({
          index: i,
          employeeId: rec.employeeId,
          error: err.message ?? 'Unknown error',
        });
      }
    }

    // Update device sync metadata
    await platformPrisma.biometricDevice.update({
      where: { id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: errors === 0 ? 'SUCCESS' : synced > 0 ? 'PARTIAL' : 'FAILED',
      },
    });

    return { synced, errors, total: records.length, errorDetails };
  }

  // ────────────────────────────────────────────────────────────────────
  // Shift Rotation (YEL-6)
  // ────────────────────────────────────────────────────────────────────

  async listRotationSchedules(companyId: string) {
    const schedules = await platformPrisma.shiftRotationSchedule.findMany({
      where: { companyId },
      include: {
        _count: { select: { assignments: true } },
      },
      orderBy: { name: 'asc' },
    });

    return schedules.map((s) => ({
      ...s,
      assignmentCount: s._count.assignments,
      _count: undefined,
    }));
  }

  async createRotationSchedule(companyId: string, data: any) {
    // Validate unique name per company
    const existing = await platformPrisma.shiftRotationSchedule.findUnique({
      where: { companyId_name: { companyId, name: data.name } },
    });
    if (existing) {
      throw ApiError.conflict(`Rotation schedule "${data.name}" already exists`);
    }

    // Validate shifts array is not empty
    if (!Array.isArray(data.shifts) || data.shifts.length === 0) {
      throw ApiError.badRequest('At least one shift is required in the rotation schedule');
    }

    // Validate all shiftIds exist and belong to this company
    const shiftIds = data.shifts.map((s: any) => s.shiftId);
    const existingShifts = await platformPrisma.companyShift.findMany({
      where: { id: { in: shiftIds }, companyId },
      select: { id: true },
    });
    const foundIds = new Set(existingShifts.map((s) => s.id));
    const missingIds = shiftIds.filter((id: string) => !foundIds.has(id));
    if (missingIds.length > 0) {
      throw ApiError.badRequest(`Shift(s) not found: ${missingIds.join(', ')}`);
    }

    // Validate effectiveFrom < effectiveTo when both are provided
    if (data.effectiveTo) {
      const from = new Date(data.effectiveFrom);
      const to = new Date(data.effectiveTo);
      if (from >= to) {
        throw ApiError.badRequest('effectiveFrom must be before effectiveTo');
      }
    }

    return platformPrisma.shiftRotationSchedule.create({
      data: {
        companyId,
        name: data.name,
        rotationPattern: data.rotationPattern,
        shifts: data.shifts,
        effectiveFrom: new Date(data.effectiveFrom),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        isActive: true,
      },
    });
  }

  async updateRotationSchedule(companyId: string, id: string, data: any) {
    const schedule = await platformPrisma.shiftRotationSchedule.findUnique({ where: { id } });
    if (!schedule || schedule.companyId !== companyId) {
      throw ApiError.notFound('Shift rotation schedule not found');
    }

    // If name is changing, check uniqueness
    if (data.name && data.name !== schedule.name) {
      const existing = await platformPrisma.shiftRotationSchedule.findUnique({
        where: { companyId_name: { companyId, name: data.name } },
      });
      if (existing) {
        throw ApiError.conflict(`Rotation schedule "${data.name}" already exists`);
      }
    }

    return platformPrisma.shiftRotationSchedule.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.rotationPattern !== undefined && { rotationPattern: data.rotationPattern }),
        ...(data.shifts !== undefined && { shifts: data.shifts }),
        ...(data.effectiveFrom !== undefined && { effectiveFrom: new Date(data.effectiveFrom) }),
        ...(data.effectiveTo !== undefined && { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deleteRotationSchedule(companyId: string, id: string) {
    const schedule = await platformPrisma.shiftRotationSchedule.findUnique({ where: { id } });
    if (!schedule || schedule.companyId !== companyId) {
      throw ApiError.notFound('Shift rotation schedule not found');
    }

    // Cascade delete assignments then the schedule
    await platformPrisma.shiftRotationAssignment.deleteMany({ where: { scheduleId: id } });
    await platformPrisma.shiftRotationSchedule.delete({ where: { id } });
    return { message: 'Shift rotation schedule deleted' };
  }

  async assignEmployeesToRotation(companyId: string, scheduleId: string, employeeIds: string[]) {
    const schedule = await platformPrisma.shiftRotationSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule || schedule.companyId !== companyId) {
      throw ApiError.notFound('Shift rotation schedule not found');
    }

    const result = await platformPrisma.shiftRotationAssignment.createMany({
      data: employeeIds.map((employeeId) => ({
        companyId,
        scheduleId,
        employeeId,
      })),
      skipDuplicates: true,
    });

    return { assigned: result.count };
  }

  async removeEmployeeFromRotation(companyId: string, scheduleId: string, employeeId: string) {
    const schedule = await platformPrisma.shiftRotationSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule || schedule.companyId !== companyId) {
      throw ApiError.notFound('Shift rotation schedule not found');
    }

    const assignment = await platformPrisma.shiftRotationAssignment.findUnique({
      where: { scheduleId_employeeId: { scheduleId, employeeId } },
    });
    if (!assignment) {
      throw ApiError.notFound('Assignment not found');
    }

    await platformPrisma.shiftRotationAssignment.delete({
      where: { scheduleId_employeeId: { scheduleId, employeeId } },
    });
    return { message: 'Employee removed from rotation' };
  }

  async executeShiftRotation(companyId: string) {
    const companySettingsRotation = await getCachedCompanySettings(companyId);
    const companyTimezoneRotation = companySettingsRotation.timezone ?? 'Asia/Kolkata';
    const dtToday = DateTime.now().setZone(companyTimezoneRotation).startOf('day');
    const today = dtToday.toJSDate();

    // Fetch all active schedules where effectiveFrom <= today
    const schedules = await platformPrisma.shiftRotationSchedule.findMany({
      where: {
        companyId,
        isActive: true,
        effectiveFrom: { lte: today },
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: today } },
        ],
      },
      include: {
        assignments: { select: { employeeId: true } },
      },
    });

    let schedulesProcessed = 0;
    let employeesRotated = 0;

    for (const schedule of schedules) {
      const shifts = schedule.shifts as Array<{ shiftId: string; weekNumber: number }>;
      if (!shifts || shifts.length < 2) continue;

      const dtEffectiveFrom = DateTime.fromJSDate(new Date(schedule.effectiveFrom)).setZone(companyTimezoneRotation).startOf('day');
      const effectiveFrom = dtEffectiveFrom.toJSDate();

      const msSinceStart = today.getTime() - effectiveFrom.getTime();
      const weeksSinceStart = Math.floor(msSinceStart / (7 * 24 * 60 * 60 * 1000));

      let shiftIndex: number;
      switch (schedule.rotationPattern) {
        case 'WEEKLY':
          shiftIndex = weeksSinceStart % shifts.length;
          break;
        case 'FORTNIGHTLY':
          shiftIndex = Math.floor(weeksSinceStart / 2) % shifts.length;
          break;
        case 'MONTHLY': {
          const monthsSinceStart =
            (dtToday.year - dtEffectiveFrom.year) * 12 +
            (dtToday.month - dtEffectiveFrom.month);
          shiftIndex = monthsSinceStart % shifts.length;
          break;
        }
        case 'CUSTOM':
        default:
          shiftIndex = weeksSinceStart % shifts.length;
          break;
      }

      const targetShift = shifts[shiftIndex];
      if (!targetShift) continue;

      // Check if the target shift has noShuffle=true — if so, skip rotation for this shift
      const shiftRecord = await platformPrisma.companyShift.findUnique({
        where: { id: targetShift.shiftId },
        select: { noShuffle: true },
      });
      if (shiftRecord?.noShuffle) continue; // This shift is excluded from auto-rotation

      const employeeIds = schedule.assignments.map((a) => a.employeeId);
      if (employeeIds.length === 0) continue;

      // Also exclude employees currently on a shift marked noShuffle
      // (their current shift should not be auto-changed)
      const employeesOnLockedShifts = await platformPrisma.employee.findMany({
        where: {
          id: { in: employeeIds },
          shift: { noShuffle: true },
        },
        select: { id: true },
      });
      const lockedEmployeeIds = new Set(employeesOnLockedShifts.map((e) => e.id));
      const rotatableEmployeeIds = employeeIds.filter((id) => !lockedEmployeeIds.has(id));
      if (rotatableEmployeeIds.length === 0) continue;

      // Update rotatable employees to the target shift
      await platformPrisma.employee.updateMany({
        where: { id: { in: rotatableEmployeeIds }, companyId },
        data: { shiftId: targetShift.shiftId },
      });

      schedulesProcessed++;
      employeesRotated += rotatableEmployeeIds.length;
    }

    return { schedulesProcessed, employeesRotated };
  }

  // ────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ────────────────────────────────────────────────────────────────────

  private async calculateAttendanceMetrics(
    companyId: string,
    data: any,
    employeeShiftId: string | null
  ) {
    let workedHours: number | null = null;
    let isLate = false;
    let lateMinutes: number | null = null;
    let isEarlyExit = false;
    let earlyMinutes: number | null = null;

    const punchIn = data.punchIn ? new Date(data.punchIn) : null;
    const punchOut = data.punchOut ? new Date(data.punchOut) : null;

    // Calculate worked hours
    if (punchIn && punchOut) {
      const diffMs = punchOut.getTime() - punchIn.getTime();
      workedHours = Math.max(0, Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100);
    }

    // Detect late arrival and early exit using shift + rules (timezone-aware)
    const shiftId = data.shiftId ?? employeeShiftId;
    if (shiftId && (punchIn || punchOut)) {
      const shift = await platformPrisma.companyShift.findUnique({ where: { id: shiftId } });
      const rules = await this.getRules(companyId);
      const companySettings = await getCachedCompanySettings(companyId);
      const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';

      if (shift) {
        const result = this.detectLateAndEarlyExit(punchIn, punchOut, shift, rules, companyTimezone);
        isLate = result.isLate;
        lateMinutes = result.lateMinutes;
        isEarlyExit = result.isEarlyExit;
        earlyMinutes = result.earlyMinutes;
      }
    }

    return { workedHours, isLate, lateMinutes, isEarlyExit, earlyMinutes };
  }

  private detectLateAndEarlyExit(
    punchIn: Date | null,
    punchOut: Date | null,
    shift: { startTime: string; endTime: string; isCrossDay?: boolean },
    rules: any,
    companyTimezone: string,
  ) {
    let isLate = false;
    let lateMinutes: number | null = null;
    let isEarlyExit = false;
    let earlyMinutes: number | null = null;

    const gracePeriod = rules.gracePeriodMinutes ? Number(rules.gracePeriodMinutes) : 0;
    const earlyExitTolerance = rules.earlyExitToleranceMinutes ? Number(rules.earlyExitToleranceMinutes) : 0;

    // Use the punch-in date as the reference attendance date
    const refDate = punchIn ?? punchOut;
    if (!refDate) return { isLate, lateMinutes, isEarlyExit, earlyMinutes };

    const dateStr = DateTime.fromJSDate(refDate).setZone(companyTimezone).toFormat('yyyy-MM-dd');

    // Parse shift times in company timezone (consistent with resolveAttendanceStatus)
    const shiftStart = parseInCompanyTimezone(dateStr, shift.startTime, companyTimezone);
    let shiftEnd = parseInCompanyTimezone(dateStr, shift.endTime, companyTimezone);

    // Handle cross-day / overnight shifts
    const isCrossDay = shift.isCrossDay ?? (shiftEnd <= shiftStart);
    if (isCrossDay) {
      shiftEnd = shiftEnd.plus({ days: 1 });
    }

    // Check late arrival
    if (punchIn && shift.startTime) {
      const punchInDt = DateTime.fromJSDate(punchIn).setZone(companyTimezone);
      const delayMinutes = punchInDt.diff(shiftStart, 'minutes').minutes;

      if (delayMinutes > gracePeriod) {
        isLate = true;
        lateMinutes = Math.ceil(delayMinutes);
      }
    }

    // Check early exit
    if (punchOut && shift.endTime) {
      const punchOutDt = DateTime.fromJSDate(punchOut).setZone(companyTimezone);
      const earlyByMinutes = shiftEnd.diff(punchOutDt, 'minutes').minutes;

      if (earlyByMinutes > earlyExitTolerance) {
        isEarlyExit = true;
        earlyMinutes = Math.ceil(earlyByMinutes);
      }
    }

    return { isLate, lateMinutes, isEarlyExit, earlyMinutes };
  }

  // ────────────────────────────────────────────────────────────────────
  // Auto Clock-Out Processing
  // ────────────────────────────────────────────────────────────────────

  /**
   * Finds all INCOMPLETE attendance records (punchIn exists, punchOut null) and
   * auto-sets punchOut = punchIn + autoClockOutMinutes if the shift has it configured
   * and enough time has elapsed.
   */
  async processAutoClockOut(companyId: string) {
    // Find all incomplete records for this company
    const incompleteRecords = await platformPrisma.attendanceRecord.findMany({
      where: {
        companyId,
        punchIn: { not: null },
        punchOut: null,
        status: 'INCOMPLETE',
      },
      include: {
        shift: {
          select: {
            id: true,
            autoClockOutMinutes: true,
            startTime: true,
            endTime: true,
            isCrossDay: true,
          },
        },
        employee: {
          select: {
            id: true,
            shiftId: true,
            locationId: true,
            employeeTypeId: true,
          },
        },
      },
    });

    const now = new Date();
    let processed = 0;
    let skipped = 0;

    for (const record of incompleteRecords) {
      const autoClockOutMinutes = record.shift?.autoClockOutMinutes;
      if (!autoClockOutMinutes || !record.punchIn) {
        skipped++;
        continue;
      }

      const punchInTime = new Date(record.punchIn).getTime();
      const autoClockOutTime = punchInTime + autoClockOutMinutes * 60 * 1000;

      if (now.getTime() < autoClockOutTime) {
        skipped++;
        continue;
      }

      // Set punchOut = punchIn + autoClockOutMinutes
      const autoPunchOut = new Date(autoClockOutTime);

      // Recalculate status using the full status resolver
      const effectiveShiftId = record.shiftId;
      let shiftInfo: ShiftInfo | null = null;
      if (record.shift) {
        shiftInfo = {
          startTime: record.shift.startTime,
          endTime: record.shift.endTime,
          isCrossDay: record.shift.isCrossDay,
        };
      }

      // Build evaluation context
      const recordDate = new Date(record.date);
      const holiday = await platformPrisma.holidayCalendar.findFirst({
        where: { companyId, date: recordDate },
        select: { name: true },
      });
      const roster = await platformPrisma.roster.findFirst({
        where: { companyId, isDefault: true },
        select: { weekOff1: true, weekOff2: true },
      });
      const companySettings = await getCachedCompanySettings(companyId);
      const companyTimezone = companySettings.timezone ?? 'Asia/Kolkata';

      const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dtRecordAutoPunch = DateTime.fromJSDate(recordDate).setZone(companyTimezone);
      const dow = dayOfWeek[dtRecordAutoPunch.weekday % 7];
      const isWeekOff = dow === roster?.weekOff1 || dow === roster?.weekOff2;

      const evaluationContext: EvaluationContext = {
        employeeId: record.employeeId,
        shiftId: effectiveShiftId,
        locationId: record.locationId,
        date: recordDate,
        isHoliday: !!holiday,
        isWeekOff,
        ...(holiday?.name && { holidayName: holiday.name }),
        ...(roster && { rosterPattern: `${roster.weekOff1 ?? ''}${roster.weekOff2 ? '/' + roster.weekOff2 : ''}` }),
      };

      const { policy } = await resolvePolicy(companyId, evaluationContext);
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

      const statusResult = resolveAttendanceStatus(
        record.punchIn,
        autoPunchOut,
        shiftInfo,
        policy,
        evaluationContext,
        rulesInput,
        companyTimezone,
      );

      await platformPrisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          punchOut: autoPunchOut,
          workedHours: statusResult.workedHours,
          status: statusResult.status as AttendanceStatus,
          isLate: statusResult.isLate,
          lateMinutes: statusResult.lateMinutes || null,
          isEarlyExit: statusResult.isEarlyExit,
          earlyMinutes: statusResult.earlyMinutes || null,
          overtimeHours: statusResult.overtimeHours > 0 ? statusResult.overtimeHours : null,
          appliedLateDeduction: statusResult.appliedLateDeduction,
          appliedEarlyExitDeduction: statusResult.appliedEarlyExitDeduction,
          remarks: `${record.remarks ? record.remarks + ' | ' : ''}Auto clock-out after ${autoClockOutMinutes} minutes`,
        },
      });

      logger.info(`Auto clock-out applied for record ${record.id} (employee ${record.employeeId})`);
      processed++;
    }

    return { processed, skipped, total: incompleteRecords.length };
  }
}

export const attendanceService = new AttendanceService();
