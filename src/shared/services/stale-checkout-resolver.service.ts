/**
 * Stale Checkout Resolver
 *
 * Determines if an open attendance record (punchIn set, punchOut missing) is
 * genuinely stale (employee forgot to check out) vs a legitimate in-progress
 * shift (e.g., a night/cross-day shift that spans two calendar days).
 *
 * Used by:
 *   1. getMyAttendanceStatus — to auto-close stale records inline so the
 *      employee sees a clean "Check In" screen on the next day.
 *   2. Hourly cron — as a safety net for records that weren't caught by #1.
 *
 * Cross-day shift safety:
 *   A night shift (e.g., 22:00-06:00) checked in at 22:00 on Day 1 is expected
 *   to check out at 06:00 on Day 2. The record is NOT stale until Day 2 06:00
 *   + a configurable buffer (default 2 hours).
 */

import { platformPrisma } from '../../config/database';
import { logger } from '../../config/logger';
import { DateTime } from 'luxon';
import { resolvePolicy, type EvaluationContext } from './policy-resolver.service';
import {
  resolveAttendanceStatus,
  type AttendanceRulesInput,
  type ShiftInfo,
} from './attendance-status-resolver.service';
import { getCachedAttendanceRules } from '../utils/config-cache';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StaleCheckResult {
  isStale: boolean;
  /** The time that should be used as punchOut if auto-closing */
  autoCloseTime: Date | null;
  reason: string;
}

// Default buffer after expected shift end before declaring stale (minutes)
const DEFAULT_BUFFER_MINUTES = 120; // 2 hours
// Fallback max duration if no shift info at all (hours from punchIn)
const NO_SHIFT_MAX_HOURS = 16;

// ─── Main Function ──────────────────────────────────────────────────────────

/**
 * Check if an open attendance record is stale.
 *
 * @param record - The open record (punchIn set, punchOut null)
 * @param companyTimezone - IANA timezone string
 * @param now - Current time (defaults to Date.now)
 */
export async function checkIfStale(
  record: { id: string; punchIn: Date; shiftId: string | null; date: Date },
  companyTimezone: string,
  now: Date = new Date(),
): Promise<StaleCheckResult> {
  const punchInDT = DateTime.fromJSDate(record.punchIn, { zone: companyTimezone });
  const nowDT = DateTime.fromJSDate(now, { zone: companyTimezone });

  // No shift — use fallback: stale after NO_SHIFT_MAX_HOURS from punchIn
  if (!record.shiftId) {
    const cutoff = punchInDT.plus({ hours: NO_SHIFT_MAX_HOURS });
    if (nowDT >= cutoff) {
      return {
        isStale: true,
        autoCloseTime: cutoff.toJSDate(),
        reason: `No shift assigned — auto-closed ${NO_SHIFT_MAX_HOURS} hours after punch-in`,
      };
    }
    return { isStale: false, autoCloseTime: null, reason: 'No shift, within max hours window' };
  }

  // Fetch shift details
  const shift = await platformPrisma.companyShift.findUnique({
    where: { id: record.shiftId },
    select: {
      startTime: true,
      endTime: true,
      isCrossDay: true,
      name: true,
      autoClockOutMinutes: true,
    },
  });

  if (!shift) {
    // Shift was deleted — treat like no-shift
    const cutoff = punchInDT.plus({ hours: NO_SHIFT_MAX_HOURS });
    if (nowDT >= cutoff) {
      return {
        isStale: true,
        autoCloseTime: cutoff.toJSDate(),
        reason: `Shift not found — auto-closed ${NO_SHIFT_MAX_HOURS} hours after punch-in`,
      };
    }
    return { isStale: false, autoCloseTime: null, reason: 'Shift not found, within max hours window' };
  }

  // Parse shift end time
  const [endH = 0, endM = 0] = shift.endTime.split(':').map(Number);

  // Calculate expected end time in company timezone
  const punchInDate = DateTime.fromJSDate(record.date, { zone: companyTimezone });
  let expectedEnd: DateTime;

  if (shift.isCrossDay) {
    // Cross-day shift: end time is on the NEXT calendar day
    expectedEnd = punchInDate.plus({ days: 1 }).set({ hour: endH ?? 0, minute: endM ?? 0, second: 0, millisecond: 0 });
  } else {
    // Same-day shift: end time is on the same calendar day
    expectedEnd = punchInDate.set({ hour: endH ?? 0, minute: endM ?? 0, second: 0, millisecond: 0 });
  }

  // Use autoClockOutMinutes if configured, otherwise use default buffer
  const bufferMinutes = shift.autoClockOutMinutes ?? DEFAULT_BUFFER_MINUTES;
  const staleCutoff = expectedEnd.plus({ minutes: bufferMinutes });

  if (nowDT >= staleCutoff) {
    return {
      isStale: true,
      autoCloseTime: expectedEnd.toJSDate(), // Close at shift end time, not now
      reason: `Shift "${shift.name}" ended at ${shift.endTime}${shift.isCrossDay ? ' (next day)' : ''} — auto-closed after ${bufferMinutes}min buffer`,
    };
  }

  return {
    isStale: false,
    autoCloseTime: null,
    reason: `Shift "${shift.name}" ${shift.isCrossDay ? '(cross-day) ' : ''}— still within expected window (ends ${shift.endTime}${shift.isCrossDay ? ' next day' : ''} + ${bufferMinutes}min buffer)`,
  };
}

// ─── Auto-Close Helper ──────────────────────────────────────────────────────

/**
 * Auto-close a stale record: set punchOut, re-resolve status, mark INCOMPLETE.
 */
export async function autoCloseStaleRecord(
  record: { id: string; employeeId: string; companyId: string; punchIn: Date; shiftId: string | null; date: Date; locationId: string | null },
  autoCloseTime: Date,
  companyTimezone: string,
  reason: string,
): Promise<void> {
  // Build evaluation context for status resolution
  const holiday = await platformPrisma.holidayCalendar.findFirst({
    where: { companyId: record.companyId, date: record.date },
    select: { name: true },
  });
  const roster = await platformPrisma.roster.findFirst({
    where: { companyId: record.companyId, isDefault: true },
    select: { weekOff1: true, weekOff2: true },
  });
  const dayOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dow = dayOfWeekNames[DateTime.fromJSDate(record.date, { zone: companyTimezone }).weekday % 7];
  const isWeekOff = dow === roster?.weekOff1 || dow === roster?.weekOff2;

  const evaluationContext: EvaluationContext = {
    employeeId: record.employeeId,
    shiftId: record.shiftId,
    locationId: record.locationId,
    date: record.date,
    isHoliday: !!holiday,
    isWeekOff,
    ...(holiday?.name && { holidayName: holiday.name }),
  };

  // Resolve policy and status
  let statusResult;
  try {
    const { policy } = await resolvePolicy(record.companyId, evaluationContext);
    const rules = await getCachedAttendanceRules(record.companyId);
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

    let shiftInfo: ShiftInfo | null = null;
    if (record.shiftId) {
      const shift = await platformPrisma.companyShift.findUnique({
        where: { id: record.shiftId },
        select: { startTime: true, endTime: true, isCrossDay: true },
      });
      if (shift) {
        shiftInfo = { startTime: shift.startTime, endTime: shift.endTime, isCrossDay: shift.isCrossDay };
      }
    }

    statusResult = resolveAttendanceStatus(
      record.punchIn,
      autoCloseTime,
      shiftInfo,
      policy,
      evaluationContext,
      rulesInput,
      companyTimezone,
    );
  } catch (err) {
    // If policy resolution fails, use basic INCOMPLETE status
    logger.warn(`Auto-close: policy resolution failed for record ${record.id}, using INCOMPLETE`, err);
    statusResult = {
      status: 'INCOMPLETE',
      workedHours: Math.max(0, (autoCloseTime.getTime() - record.punchIn.getTime()) / 3600000),
      isLate: false,
      lateMinutes: 0,
      isEarlyExit: false,
      earlyMinutes: 0,
      overtimeHours: 0,
      appliedLateDeduction: null,
      appliedEarlyExitDeduction: null,
      finalStatusReason: `Auto-closed: ${reason}`,
    };
  }

  // Update the record
  await platformPrisma.attendanceRecord.update({
    where: { id: record.id },
    data: {
      punchOut: autoCloseTime,
      status: 'INCOMPLETE',
      workedHours: statusResult.workedHours,
      isLate: statusResult.isLate,
      lateMinutes: statusResult.lateMinutes,
      isEarlyExit: statusResult.isEarlyExit,
      earlyMinutes: statusResult.earlyMinutes,
      overtimeHours: statusResult.overtimeHours,
      finalStatusReason: `[Auto-closed] ${reason}. ${statusResult.finalStatusReason ?? ''}`.trim(),
      remarks: `Auto-closed: missed checkout. ${reason}`,
    },
  });

  logger.info(
    `Auto-closed stale record ${record.id} for employee ${record.employeeId} on ${record.date.toISOString().split('T')[0]}: ${reason}`,
  );
}
